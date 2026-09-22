#include "midi/MidiValidator.h"
#include "common/Error.h"
#include <algorithm>
#include <cstdint>

namespace lostmidi::midi {
namespace {
[[noreturn]] void invalid() { throw ApiError(400, "INVALID_MIDI", "Invalid or unsupported Standard MIDI File."); }
class Reader {
public:
    explicit Reader(std::span<const std::byte> data) : data_(data) {}
    std::size_t remaining() const { return data_.size() - at_; }
    unsigned byte() { if (!remaining()) invalid(); return std::to_integer<unsigned>(data_[at_++]); }
    unsigned peek() const { if (!remaining()) invalid(); return std::to_integer<unsigned>(data_[at_]); }
    std::uint32_t number(unsigned count) { std::uint32_t n = 0; while (count--) n = (n << 8) | byte(); return n; }
    std::uint32_t vlq() {
        std::uint32_t n = 0;
        for (int i = 0; i < 4; ++i) { const auto b = byte(); n = (n << 7) | (b & 127); if (!(b & 128)) return n; }
        invalid();
    }
    std::span<const std::byte> take(std::size_t count) {
        if (count > remaining()) invalid();
        auto result = data_.subspan(at_, count);
        at_ += count;
        return result;
    }
    void tag(const char* value) { for (int i = 0; i < 4; ++i) if (byte() != static_cast<unsigned char>(value[i])) invalid(); }
private:
    std::span<const std::byte> data_;
    std::size_t at_ = 0;
};
void track(Reader r) {
    unsigned running = 0;
    bool ended = false;
    while (r.remaining()) {
        r.vlq();
        unsigned status = r.peek();
        if (status & 128) r.byte();
        else { if (!running) invalid(); status = running; }
        if (status >= 0x80 && status <= 0xef) {
            running = status;
            const int count = ((status & 0xf0) == 0xc0 || (status & 0xf0) == 0xd0) ? 1 : 2;
            for (int i = 0; i < count; ++i) if (r.byte() >= 128) invalid();
        } else if (status == 0xff) {
            running = 0;
            const auto type = r.byte();
            if (type > 127) invalid();
            const auto length = r.vlq();
            // Check fixed-width meta events; unknown meta events are length-delimited.
            if ((type == 0x00 && length != 2) || (type == 0x20 && length != 1) ||
                (type == 0x21 && length != 1) || (type == 0x2f && length != 0) ||
                (type == 0x51 && length != 3) || (type == 0x54 && length != 5) ||
                (type == 0x58 && length != 4) || (type == 0x59 && length != 2)) invalid();
            r.take(length);
            if (type == 0x2f) { if (r.remaining()) invalid(); ended = true; break; }
        } else if (status == 0xf0 || status == 0xf7) {
            running = 0; r.take(r.vlq());
        } else invalid();
    }
    if (!ended) invalid();
}
}
void validateMidi(std::span<const std::byte> bytes) {
    if (bytes.size() > maxImportBytes) throw ApiError(413, "FILE_TOO_LARGE", "MIDI files are limited to 1 MiB.");
    Reader r(bytes);
    r.tag("MThd");
    if (r.number(4) != 6) invalid();
    const auto format = r.number(2), tracks = r.number(2), division = r.number(2);
    if (format > 2 || !tracks || tracks > 1024 || (format == 0 && tracks != 1)) invalid();
    if (division & 0x8000) {
        const auto fps = division >> 8;
        if ((fps != 0xe8 && fps != 0xe7 && fps != 0xe3 && fps != 0xe2) || !(division & 255)) invalid();
    } else if (!division) invalid();
    for (std::uint32_t i = 0; i < tracks; ++i) { r.tag("MTrk"); const auto n = r.number(4); track(Reader(r.take(n))); }
    if (r.remaining()) invalid();
}
void validateMidiFilename(const std::string& filename) {
    const auto bad = [] { throw ApiError(400, "INVALID_FILE", "A valid UTF-8 .mid or .midi filename is required."); };
    if (filename.empty() || filename.size() > 255 || filename.front() == ' ' || filename.back() == ' ' ||
        filename.find_first_of("/\\") != std::string::npos) bad();
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
    auto lower = filename;
    std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) { return c >= 'A' && c <= 'Z' ? static_cast<char>(c + 32) : static_cast<char>(c); });
    if (!lower.ends_with(".mid") && !lower.ends_with(".midi")) bad();
}
}
