#include "storage/S3ObjectStorage.h"
#include "common/Error.h"
#include <openssl/hmac.h>
#include <array>
#include <cstdlib>
#include <ctime>
#include <regex>

namespace lostmidi::storage {
namespace {
[[noreturn]] void unavailable() { throw ApiError(503, "STORAGE_UNAVAILABLE", "Object storage is temporarily unavailable."); }
std::span<const std::byte> bytesOf(const std::string& s) { return std::as_bytes(std::span(s.data(), s.size())); }
std::string hmac(const std::string& key, const std::string& message) {
    std::array<unsigned char, EVP_MAX_MD_SIZE> result{}; unsigned length = 0;
    if (!HMAC(EVP_sha256(), key.data(), static_cast<int>(key.size()),
        reinterpret_cast<const unsigned char*>(message.data()), message.size(), result.data(), &length)) unavailable();
    return std::string(reinterpret_cast<const char*>(result.data()), length);
}
std::string hex(const std::string& value) {
    std::string result; constexpr char digits[] = "0123456789abcdef";
    for (unsigned char c : value) { result += digits[c >> 4]; result += digits[c & 15]; } return result;
}
std::string now() {
    const auto t = std::time(nullptr); std::tm tm{};
#ifdef _WIN32
    gmtime_s(&tm, &t);
#else
    gmtime_r(&t, &tm);
#endif
    std::array<char, 32> output{}; std::strftime(output.data(), output.size(), "%Y%m%dT%H%M%SZ", &tm); return output.data();
}
}
S3Config S3Config::fromEnvironment() {
    const auto env = [](const char* name, const char* fallback = "") { const char* v = std::getenv(name); return std::string(v && *v ? v : fallback); };
    // Uploaded objects are publicly distributed (anonymous read is allowed by design),
    // so the operator must acknowledge public distribution rather than bucket privacy.
    if (env("S3_PUBLIC_DISTRIBUTION_CONFIRMED") != "true") throw std::runtime_error("Confirm uploaded objects are publicly distributed before enabling S3 storage.");
    const auto style = env("S3_PATH_STYLE", "true");
    if (style != "true" && style != "false") throw std::runtime_error("Invalid S3_PATH_STYLE.");
    return {env("S3_ENDPOINT"), env("S3_REGION", "us-east-1"), env("S3_BUCKET"), env("S3_ACCESS_KEY_ID"),
        env("S3_SECRET_ACCESS_KEY"), env("S3_PREFIX", "lostmidi"), style == "true"};
}
std::map<std::string, std::string> signS3(const S3Config& config, const std::string& method,
    const std::string& host, const std::string& path, const std::string& payloadHash, const std::string& timestamp) {
    const std::string scope = timestamp.substr(0, 8) + "/" + config.region + "/s3/aws4_request";
    std::map<std::string, std::string> headers{{"host", host}, {"x-amz-content-sha256", payloadHash}, {"x-amz-date", timestamp}};
    if (method == "PUT") {
        // Ceph RGW (e.g. RainYun ROS) rejects PutObject with 403 AccessDenied unless
        // Content-Type is present AND part of the signed headers, so it must be added
        // here (before signing) with the exact value the request body carries.
        headers["content-type"] = "application/octet-stream";
        headers["x-amz-acl"] = "private";
        headers["if-none-match"] = "*";
    }
    std::string canonicalHeaders, signedHeaders;
    for (const auto& [key, value] : headers) { canonicalHeaders += key + ":" + value + "\n"; if (!signedHeaders.empty()) signedHeaders += ";"; signedHeaders += key; }
    const auto canonical = method + "\n" + path + "\n\n" + canonicalHeaders + "\n" + signedHeaders + "\n" + payloadHash;
    const auto toSign = "AWS4-HMAC-SHA256\n" + timestamp + "\n" + scope + "\n" + sha256(bytesOf(canonical));
    const auto signingKey = hmac(hmac(hmac(hmac("AWS4" + config.secretKey, timestamp.substr(0, 8)), config.region), "s3"), "aws4_request");
    headers["authorization"] = "AWS4-HMAC-SHA256 Credential=" + config.accessKey + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + hex(hmac(signingKey, toSign));
    return headers;
}
S3ObjectStorage::S3ObjectStorage(S3Config config) : config_(std::move(config)) {
    // Restricted to an HTTPS origin and conservative unreserved path segments.
    static const std::regex endpoint("^https://([a-z0-9][a-z0-9.-]*)(:[0-9]{1,5})?/?$");
    static const std::regex bucket("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$");
    static const std::regex segment("^[A-Za-z0-9_-]+$");
    static const std::regex region("^[A-Za-z0-9_-]{1,64}$");
    static const std::regex access("^[A-Za-z0-9_-]{1,128}$");
    std::smatch match;
    if (!std::regex_match(config_.endpoint, match, endpoint) || !std::regex_match(config_.bucket, bucket) ||
        !std::regex_match(config_.region, region) || !std::regex_match(config_.accessKey, access) ||
        config_.secretKey.empty() || config_.secretKey.size() > 1024 || config_.prefix.empty() || config_.prefix.size() > 160)
        throw std::runtime_error("Invalid S3 configuration.");
    std::size_t start = 0;
    while (start < config_.prefix.size()) {
        const auto end = config_.prefix.find('/', start);
        if (!std::regex_match(config_.prefix.substr(start, end == std::string::npos ? end : end - start), segment))
            throw std::runtime_error("Invalid S3 prefix.");
        if (end == std::string::npos) break;
        start = end + 1;
    }
    if (config_.prefix.back() == '/') throw std::runtime_error("Invalid S3 prefix.");
    host_ = (config_.pathStyle ? "" : config_.bucket + ".") + match[1].str() + match[2].str();
    origin_ = "https://" + host_;
    basePath_ = "/" + (config_.pathStyle ? config_.bucket + "/" : "") + config_.prefix + "/";
    loop_.run();
}
void S3ObjectStorage::checkKey(const std::string& key) const {
    if (key.size() != 64 || key.find_first_not_of("0123456789abcdef") != std::string::npos) throw std::invalid_argument("Invalid object key.");
}
drogon::HttpResponsePtr S3ObjectStorage::request(drogon::HttpMethod method, const std::string& key,
    std::span<const std::byte> bytes, std::size_t readLimit) const {
    checkKey(key);
    const std::string verb = method == drogon::Put ? "PUT" : method == drogon::Head ? "HEAD" : method == drogon::Delete ? "DELETE" : "GET";
    auto req = drogon::HttpRequest::newHttpRequest(); req->setMethod(method); req->setPath(basePath_ + key);
    req->addHeader("accept-encoding", "identity");
    if (method == drogon::Get && readLimit) req->addHeader("range", "bytes=0-" + std::to_string(readLimit - 1));
    for (const auto& [name, value] : signS3(config_, verb, host_, basePath_ + key, sha256(bytes), now())) req->addHeader(name, value);
    if (method == drogon::Put) req->setBody(std::string(reinterpret_cast<const char*>(bytes.data()), bytes.size()));
    auto client = drogon::HttpClient::newHttpClient(origin_, loop_.getLoop(), false, true);
    // No redirects and no credential-bearing URLs; diagnostics never expose provider responses.
    const auto [result, response] = client->sendRequest(req, 15.0);
    if (result != drogon::ReqResult::Ok || !response) unavailable();
    return response;
}
bool S3ObjectStorage::exists(const std::string& key) const {
    const auto response = request(drogon::Head, key);
    if (response->statusCode() == 404) return false;
    if (response->statusCode() != 200) unavailable();
    return true;
}
void S3ObjectStorage::verify(const std::string& key, std::size_t size) const {
    const auto metadata = request(drogon::Head, key);
    if (metadata->statusCode() != 200 || metadata->getHeader("content-length") != std::to_string(size)) unavailable();
    // The configured S3 service must honor Range. Request one extra byte so an
    // object changed after HEAD cannot be silently accepted as a matching prefix.
    const auto response = request(drogon::Get, key, {}, size + 1);
    const auto body = response->body();
    if ((response->statusCode() != 200 && response->statusCode() != 206) || body.size() != size ||
        sha256(std::as_bytes(std::span(body.data(), body.size()))) != key) unavailable();
}
bool S3ObjectStorage::store(const std::string& key, std::span<const std::byte> bytes) {
    checkKey(key);
    if (bytes.empty() || bytes.size() > 1024 * 1024 || sha256(bytes) != key)
        throw std::invalid_argument("Object content must match its key and fit within 1 MiB.");
    // PostgreSQL locks coordinate managed writers; conditional PUT also prevents
    // overwriting an object created by another client between HEAD and PUT.
    if (exists(key)) { verify(key, bytes.size()); return false; }
    const auto response = request(drogon::Put, key, bytes);
    if (response->statusCode() == 412) { verify(key, bytes.size()); return false; }
    if (response->statusCode() != 200) unavailable();
    return true;
}
void S3ObjectStorage::remove(const std::string& key) {
    const auto response = request(drogon::Delete, key);
    if (response->statusCode() != 204 && response->statusCode() != 200 && response->statusCode() != 404) unavailable();
}
}
