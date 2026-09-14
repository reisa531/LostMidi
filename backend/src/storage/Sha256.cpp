#include "storage/IObjectStorage.h"
#include <array>
#include <openssl/evp.h>
#include <stdexcept>

namespace lostmidi::storage {
std::string sha256(std::span<const std::byte> bytes) {
    std::array<unsigned char, EVP_MAX_MD_SIZE> digest{};
    unsigned int length = 0;
    if (EVP_Digest(bytes.data(), bytes.size(), digest.data(), &length, EVP_sha256(), nullptr) != 1 || length != 32) {
        throw std::runtime_error("Unable to calculate SHA-256.");
    }
    constexpr char hex[] = "0123456789abcdef";
    std::string result;
    result.reserve(64);
    for (unsigned int i = 0; i < length; ++i) {
        result += hex[digest[i] >> 4];
        result += hex[digest[i] & 15];
    }
    return result;
}
}  // namespace lostmidi::storage
