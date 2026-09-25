#include "storage/LocalObjectStorage.h"
#include "common/Error.h"
#include "midi/MidiValidator.h"
#include <algorithm>
#include <array>
#include <fstream>
#include <openssl/rand.h>
#include <stdexcept>

namespace lostmidi::storage {
namespace fs = std::filesystem;
namespace {
[[noreturn]] void unavailable() { throw ApiError(503, "STORAGE_UNAVAILABLE", "Object storage is temporarily unavailable."); }
}

LocalObjectStorage::LocalObjectStorage(const fs::path& root) {
    if (root.empty()) throw std::invalid_argument("Storage root must not be empty.");
    if (fs::is_symlink(fs::symlink_status(root))) throw std::invalid_argument("Storage root must not be a symlink.");
    fs::create_directories(root);
    root_ = fs::canonical(root);
    if (!fs::is_directory(root_)) throw std::invalid_argument("Storage root must be a directory.");
}

fs::path LocalObjectStorage::checkedPath(const std::string& key) const {
    if (key.size() != 64 || !std::all_of(key.begin(), key.end(), [](char c) {
        return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f');
    })) throw std::invalid_argument("Object key must be a lowercase SHA-256 digest.");
    if (fs::is_symlink(fs::symlink_status(root_)) || !fs::is_directory(root_))
        throw std::runtime_error("Storage root is no longer a regular directory.");
    const auto path = root_ / key;
    const auto status = fs::symlink_status(path);
    if (fs::is_symlink(status) || (fs::exists(status) && !fs::is_regular_file(status)))
        throw std::runtime_error("Object path is not a regular file.");
    return path;
}

bool LocalObjectStorage::store(const std::string& key, std::span<const std::byte> bytes) {
    if (bytes.empty() || bytes.size() > midi::maxImportBytes)
        throw std::invalid_argument("Object size must be between 1 and 15,000,000 bytes (15 MB).");
    std::lock_guard lock(mutex_);
    const auto path = checkedPath(key);
    if (sha256(bytes) != key) throw std::invalid_argument("Object key does not match its content.");
    if (fs::exists(path)) {
        // Avoid silently accepting a truncated or modified object.
        std::ifstream existing(path, std::ios::binary);
        std::array<char, 8192> chunk{};
        std::size_t offset = 0;
        while (existing.read(chunk.data(), static_cast<std::streamsize>(chunk.size())) || existing.gcount() > 0) {
            const auto read = static_cast<std::size_t>(existing.gcount());
            if (offset + read > bytes.size() || !std::equal(chunk.data(), chunk.data() + read,
                    reinterpret_cast<const char*>(bytes.data()) + offset))
                throw std::runtime_error("Stored object content does not match its digest.");
            offset += read;
        }
        if (existing.bad() || offset != bytes.size()) throw std::runtime_error("Unable to verify stored object.");
        return false;
    }

    std::array<unsigned char, 16> random{};
    if (RAND_bytes(random.data(), static_cast<int>(random.size())) != 1)
        throw std::runtime_error("Unable to create a temporary object name.");
    const auto temporary = root_ / (".pending-" + sha256(std::as_bytes(std::span(random))));
    // A private, backend-owned storage directory is a deployment requirement.
    // The mutex serializes operations within this instance; it is not a distributed lock.
    try {
        std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
        output.exceptions(std::ios::failbit | std::ios::badbit);
        output.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
        output.close();
        (void)checkedPath(key);
        fs::rename(temporary, path);
    } catch (...) {
        std::error_code ignored;
        fs::remove(temporary, ignored);
        throw;
    }
    return true;
}

bool LocalObjectStorage::exists(const std::string& key) const {
    std::lock_guard lock(mutex_);
    return fs::exists(checkedPath(key));
}

std::string LocalObjectStorage::read(const std::string& key, std::size_t expectedSize) const {
    if (expectedSize == 0 || expectedSize > midi::maxImportBytes)
        throw std::invalid_argument("Object size must be between 1 and 15,000,000 bytes (15 MB).");
    try {
        std::lock_guard lock(mutex_);
        const auto path = checkedPath(key);
        if (fs::file_size(path) != expectedSize) unavailable();
        std::ifstream input(path, std::ios::binary);
        if (!input) unavailable();
        // One extra byte detects growth after file_size() without an unbounded read.
        std::string body(expectedSize + 1, '\0');
        input.read(body.data(), static_cast<std::streamsize>(body.size()));
        if (input.bad() || input.gcount() != static_cast<std::streamsize>(expectedSize)) unavailable();
        body.resize(expectedSize);
        if (sha256(std::as_bytes(std::span(body.data(), body.size()))) != key) unavailable();
        return body;
    } catch (const std::invalid_argument&) {
        throw;
    } catch (...) {
        unavailable();
    }
}

void LocalObjectStorage::remove(const std::string& key) {
    std::lock_guard lock(mutex_);
    fs::remove(checkedPath(key));
}
}  // namespace lostmidi::storage
