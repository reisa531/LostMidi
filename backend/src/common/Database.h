#pragma once
#include <drogon/orm/DbClient.h>
#include <optional>

namespace lostmidi {
template <typename T>
std::optional<T> nullable(const drogon::orm::Field& field) {
    return field.isNull() ? std::nullopt : std::optional<T>(field.as<T>());
}
}  // namespace lostmidi
