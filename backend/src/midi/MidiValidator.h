#pragma once
#include <cstddef>
#include <span>
#include <string>

namespace lostmidi::midi {
inline constexpr std::size_t maxImportBytes = 15 * 1000 * 1000;
// Accept any nonempty original file up to 15,000,000 bytes inclusive; never parse or modify it.
void validateFileContent(std::span<const std::byte> bytes);
void validateFilename(const std::string& filename);
}
