#pragma once
#include <cstddef>
#include <span>
#include <string>

namespace lostmidi {
inline std::string base64(std::span<const std::byte> bytes) {
    constexpr char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string output; output.reserve(((bytes.size() + 2) / 3) * 4);
    for (std::size_t i = 0; i < bytes.size(); i += 3) {
        const auto a = std::to_integer<unsigned char>(bytes[i]);
        const auto b = i + 1 < bytes.size() ? std::to_integer<unsigned char>(bytes[i + 1]) : 0;
        const auto c = i + 2 < bytes.size() ? std::to_integer<unsigned char>(bytes[i + 2]) : 0;
        output += alphabet[a >> 2]; output += alphabet[((a & 3) << 4) | (b >> 4)];
        output += i + 1 < bytes.size() ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
        output += i + 2 < bytes.size() ? alphabet[c & 63] : '=';
    }
    return output;
}
}
