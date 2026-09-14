#pragma once
#include <charconv>
#include <cstdint>
#include <string_view>
#include "common/Error.h"

namespace lostmidi {
inline int positiveInteger(std::string_view value, int maximum, const char* name) {
    int number = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), number);
    if (value.empty() || error != std::errc{} || end != value.data() + value.size() ||
        number < 1 || number > maximum) {
        throw ApiError(400, "INVALID_INPUT", std::string(name) + " must be a positive integer within the allowed range.");
    }
    return number;
}

struct Page {
    int number = 1;
    int size = 20;
    [[nodiscard]] std::int64_t offset() const {
        return (static_cast<std::int64_t>(number) - 1) * size;
    }
    void validate() const {
        if (number < 1 || number > 1000000 || size < 1 || size > 100) {
            throw ApiError(400, "INVALID_PAGINATION", "page must be 1–1000000 and pageSize must be 1–100.");
        }
    }
};
}  // namespace lostmidi
