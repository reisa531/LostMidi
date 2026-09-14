#include "auth/Password.h"
#include "storage/IObjectStorage.h"
#include <openssl/evp.h>
#include <openssl/crypto.h>
#include <openssl/rand.h>
#include <array>
#include <regex>
#include <stdexcept>

namespace lostmidi::auth {
bool validPasswordHash(const std::string& encoded) {
    static const std::regex pattern("^pbkdf2_sha256:600000:[0-9a-f]{32}:[0-9a-f]{64}$");
    return std::regex_match(encoded, pattern);
}
bool verifyPassword(const std::string& password, const std::string& encoded) {
    if (!validPasswordHash(encoded) || password.empty() || password.size() > 1024) return false;
    const auto saltStart = encoded.find(':', encoded.find(':') + 1) + 1;
    std::array<unsigned char, 16> salt{};
    std::array<unsigned char, 32> expected{}, actual{};
    for (std::size_t i = 0; i < salt.size(); ++i)
        salt[i] = static_cast<unsigned char>(std::stoul(encoded.substr(saltStart + i * 2, 2), nullptr, 16));
    for (std::size_t i = 0; i < expected.size(); ++i)
        expected[i] = static_cast<unsigned char>(std::stoul(encoded.substr(saltStart + 33 + i * 2, 2), nullptr, 16));
    if (PKCS5_PBKDF2_HMAC(password.data(), static_cast<int>(password.size()), salt.data(),
            static_cast<int>(salt.size()), 600000, EVP_sha256(), static_cast<int>(actual.size()), actual.data()) != 1)
        throw std::runtime_error("Password verification failed.");
    return CRYPTO_memcmp(actual.data(), expected.data(), actual.size()) == 0;
}
std::string digest(const std::string& value) {
    return storage::sha256(std::as_bytes(std::span(value.data(), value.size())));
}
std::string randomToken() {
    std::array<unsigned char, 32> bytes{};
    if (RAND_bytes(bytes.data(), static_cast<int>(bytes.size())) != 1) throw std::runtime_error("Random generator failed.");
    constexpr char hex[] = "0123456789abcdef";
    std::string token;
    for (auto byte : bytes) { token += hex[byte >> 4]; token += hex[byte & 15]; }
    return token;
}
}
