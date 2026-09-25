#include "midi/MidiImportService.h"
#include "midi/MidiWriteService.h"
#include <regex>
#include <string_view>

namespace lostmidi::midi {
namespace {
std::string creationFingerprint(const MidiEntry& entry, const std::optional<MidiFile>& file) {
    // Length prefixes keep field boundaries unambiguous without depending on JSON order.
    std::string payload;
    const auto field = [&](std::string_view value) {
        payload += std::to_string(value.size()); payload += ':'; payload.append(value);
    };
    const auto optional = [&](const std::optional<std::string>& value) {
        field(value ? "present" : "null"); if (value) field(*value);
    };
    field("midi-creation-v1");
    field(entry.slug); field(entry.title); optional(entry.description);
    optional(entry.estimatedYear ? std::optional<std::string>(std::to_string(*entry.estimatedYear)) : std::nullopt);
    optional(entry.estimatedDate);
    field(entry.archiveStatus); optional(entry.copyrightStatus); optional(entry.license);
    optional(entry.rightsHolder); optional(entry.distributionPermission);
    field(file ? "file" : "no-file");
    if (file) {
        field(file->originalFilename); field(file->sha256);
        field(file->publicDistributionConfirmed ? "true" : "false");
    }
    return storage::sha256(std::as_bytes(std::span(payload.data(), payload.size())));
}
}
std::vector<std::byte> decodeMidiContentBase64(const std::string& encoded) {
    if (encoded.size() > ((maxImportBytes + 2) / 3) * 4)
        throw ApiError(413, "FILE_TOO_LARGE", "Files must be at most 15 MB (15,000,000 bytes).");
    const auto invalid = [] { throw ApiError(400, "INVALID_FILE", "content_base64 must be canonical base64."); };
    if (encoded.empty() || encoded.size() % 4 != 0) invalid();
    const auto value = [](char c) -> int {
        if (c >= 'A' && c <= 'Z') return c - 'A';
        if (c >= 'a' && c <= 'z') return c - 'a' + 26;
        if (c >= '0' && c <= '9') return c - '0' + 52;
        if (c == '+') return 62;
        if (c == '/') return 63;
        return -1;
    };
    const std::size_t padding = encoded.back() == '=' ? (encoded[encoded.size() - 2] == '=' ? 2 : 1) : 0;
    const auto size = encoded.size() / 4 * 3 - padding;
    if (size > maxImportBytes) throw ApiError(413, "FILE_TOO_LARGE", "Files must be at most 15 MB (15,000,000 bytes).");
    std::vector<std::byte> result; result.reserve(size);
    for (std::size_t i = 0; i < encoded.size(); i += 4) {
        const auto a = value(encoded[i]), b = value(encoded[i + 1]);
        const bool last = i + 4 == encoded.size();
        const bool padC = last && padding == 2, padD = last && padding != 0;
        const auto c = padC ? 0 : value(encoded[i + 2]), d = padD ? 0 : value(encoded[i + 3]);
        if (a < 0 || b < 0 || c < 0 || d < 0 || (padC && (b & 15)) || (padD && !padC && (c & 3))) invalid();
        result.push_back(static_cast<std::byte>((a << 2) | (b >> 4)));
        if (!padC) result.push_back(static_cast<std::byte>(((b & 15) << 4) | (c >> 2)));
        if (!padD) result.push_back(static_cast<std::byte>(((c & 3) << 6) | d));
    }
    return result;
}
MidiEntry MidiImportService::create(MidiEntry entry, const std::string& requestId,
    const std::optional<MidiCreationFile>& upload) {
    static const std::regex uuid("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    if (requestId.size() != 36 || !std::regex_match(requestId, uuid))
        throw ApiError(400, "INVALID_INPUT", "request_id must be a lowercase UUID v4.");
    MidiWriteService::validate(entry);
    std::optional<MidiFile> file;
    if (upload) {
        if (!enabled_) throw ApiError(503, "IMPORT_DISABLED", "File import is disabled until durable S3 storage is configured.");
        if (!upload->rightsConfirmed) throw ApiError(400, "RIGHTS_CONFIRMATION_REQUIRED", "Confirm the right to publicly distribute this file.");
        validateFilename(upload->filename); validateFileContent(upload->bytes);
        file.emplace(); file->originalFilename = upload->filename; file->fileSize = upload->bytes.size();
        file->sha256 = storage::sha256(upload->bytes); file->storageKey = file->sha256;
        file->publicDistributionConfirmed = true;
    }
    const auto fingerprint = creationFingerprint(entry, file);
    return repository_.createWithRequest(entry, requestId, fingerprint, file, [&] {
        if (file) objects_.store(file->storageKey, upload->bytes);
    });
}
FileEditor MidiImportService::get(std::int64_t id) {
    if (id < 1) throw ApiError(400, "INVALID_INPUT", "A positive MIDI id is required.");
    return repository_.fileEditor(id);
}
FileImportResult MidiImportService::import(std::int64_t id, std::int64_t revision, const std::string& filename,
    std::span<const std::byte> bytes, bool rightsConfirmed) {
    if (!enabled_) throw ApiError(503, "IMPORT_DISABLED", "File import is disabled until durable S3 storage is configured.");
    if (id < 1 || revision < 1) throw ApiError(400, "INVALID_INPUT", "A positive MIDI id and revision are required.");
    if (!rightsConfirmed) throw ApiError(400, "RIGHTS_CONFIRMATION_REQUIRED", "Confirm the right to publicly distribute this file.");
    validateFilename(filename);
    validateFileContent(bytes);
    // Check ownership and parent before creating any storage or journal records.
    repository_.fileEditor(id);
    MidiFile file; file.midiId = id; file.originalFilename = filename; file.publicDistributionConfirmed = true;
    file.sha256 = storage::sha256(bytes); file.storageKey = file.sha256; file.fileSize = bytes.size();
    return repository_.importFile(file, revision, [&] { objects_.store(file.storageKey, bytes); });
}
std::size_t MidiImportService::cleanup() {
    return repository_.cleanupImports([&](const std::string& key) { objects_.remove(key); });
}
}
