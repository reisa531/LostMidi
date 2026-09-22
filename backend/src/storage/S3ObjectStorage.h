#pragma once
#include "storage/IObjectStorage.h"
#include <map>
#include <trantor/net/EventLoopThread.h>
#include <drogon/HttpClient.h>

namespace lostmidi::storage {
struct S3Config {
    std::string endpoint, region, bucket, accessKey, secretKey, prefix;
    bool pathStyle = true;
    static S3Config fromEnvironment();
};
// Exposed only for deterministic signing tests. Headers are never logged.
std::map<std::string, std::string> signS3(const S3Config& config, const std::string& method,
    const std::string& host, const std::string& path, const std::string& payloadHash, const std::string& timestamp);
class S3ObjectStorage final : public IObjectStorage {
public:
    explicit S3ObjectStorage(S3Config config);
    bool store(const std::string& key, std::span<const std::byte> bytes) override;
    bool exists(const std::string& key) const override;
    void remove(const std::string& key) override;
private:
    drogon::HttpResponsePtr request(drogon::HttpMethod method, const std::string& key,
        std::span<const std::byte> bytes = {}, std::size_t readLimit = 0) const;
    void verify(const std::string& key, std::size_t size) const;
    void checkKey(const std::string& key) const;
    S3Config config_;
    std::string host_, origin_, basePath_;
    // Dedicated loop also supports the offline cleanup CLI; no global app loop required.
    mutable trantor::EventLoopThread loop_;
};
}
