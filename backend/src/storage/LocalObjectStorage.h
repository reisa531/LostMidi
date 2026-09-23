#pragma once
#include "storage/IObjectStorage.h"
#include <filesystem>
#include <mutex>

namespace lostmidi::storage {
class LocalObjectStorage final : public IObjectStorage {
public:
    explicit LocalObjectStorage(const std::filesystem::path& root);
    bool store(const std::string& key, std::span<const std::byte> bytes) override;
    bool exists(const std::string& key) const override;
    std::string read(const std::string& key, std::size_t expectedSize) const override;
    void remove(const std::string& key) override;
private:
    std::filesystem::path checkedPath(const std::string& key) const;
    std::filesystem::path root_;
    mutable std::mutex mutex_;
};
}  // namespace lostmidi::storage
