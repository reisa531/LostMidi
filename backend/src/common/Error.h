#pragma once
#include <stdexcept>
#include <string>
#include <utility>

namespace lostmidi {
// Only these deliberately public messages may reach an HTTP client.
class ApiError final : public std::runtime_error {
public:
    ApiError(int status, std::string code, std::string message)
        : std::runtime_error(std::move(message)), status(status), code(std::move(code)) {}
    int status;
    std::string code;
};
}  // namespace lostmidi
