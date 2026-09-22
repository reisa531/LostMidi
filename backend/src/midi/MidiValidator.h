#pragma once
#include <cstddef>
#include <span>
#include <string>

namespace lostmidi::midi {
inline constexpr std::size_t maxImportBytes = 1024 * 1024;
// Structural validation only; never renders, executes or modifies the original bytes.
void validateMidi(std::span<const std::byte> bytes);
void validateMidiFilename(const std::string& filename);
}
