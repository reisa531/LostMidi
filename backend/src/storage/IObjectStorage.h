#pragma once
#include <cstddef>
#include <span>
#include <string>

namespace lostmidi::storage {
class IObjectStorage {
public:
    virtual ~IObjectStorage() = default;
    // Immutable content-addressed keys: lowercase SHA-256 of the exact bytes.
    // Returns false when an identical object is already stored.
    virtual bool store(const std::string& key, std::span<const std::byte> bytes) = 0;
    virtual bool exists(const std::string& key) const = 0;
    virtual std::string read(const std::string& key, std::size_t expectedSize) const = 0;
    virtual void remove(const std::string& key) = 0;
};
std::string sha256(std::span<const std::byte> bytes);
}  // namespace lostmidi::storage
