#include "midi/MidiValidator.h"
#include "common/Error.h"
#include <cstdint>

namespace lostmidi::midi {
void validateFileContent(std::span<const std::byte> bytes) {
    if (bytes.empty()) throw ApiError(400, "INVALID_FILE", "A nonempty file is required.");
    if (bytes.size() > maxImportBytes) throw ApiError(413, "FILE_TOO_LARGE", "Files must be at most 15 MB (15,000,000 bytes).");
}
void validateFilename(const std::string& filename) {
    const auto bad = [] { throw ApiError(400, "INVALID_FILE", "A valid UTF-8 filename of at most 255 bytes without path separators, control characters, or leading/trailing whitespace is required."); };
    if (filename.empty() || filename.size() > 255 || filename == "." || filename == ".." ||
        filename.front() == ' ' || filename.back() == ' ' || filename.find_first_of("/\\") != std::string::npos) bad();
    for (std::size_t i = 0; i < filename.size();) {
        auto c = static_cast<unsigned char>(filename[i++]);
        std::uint32_t point = c, minimum = 0;
        int count = 0;
        if (c >= 0xc2 && c <= 0xdf) { point = c & 31; minimum = 0x80; count = 1; }
        else if (c >= 0xe0 && c <= 0xef) { point = c & 15; minimum = 0x800; count = 2; }
        else if (c >= 0xf0 && c <= 0xf4) { point = c & 7; minimum = 0x10000; count = 3; }
        else if (c >= 128) bad();
        while (count--) { if (i == filename.size()) bad(); c = static_cast<unsigned char>(filename[i++]); if ((c & 192) != 128) bad(); point = (point << 6) | (c & 63); }
        if (point < minimum || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) || point < 32 || (point >= 127 && point <= 159)) bad();
    }
}
}
