#include <gtest/gtest.h>
#include "common/Error.h"
#include "midi/MidiService.h"
#include "midi/MidiFileService.h"
#include "storage/LocalObjectStorage.h"
#include <fstream>
#include <limits>
#include <map>
#include <chrono>

using namespace lostmidi;

namespace {
// A small in-memory archive keeps service tests independent of PostgreSQL.
class MemoryArchive : public midi::IMidiRepository, public person::IPersonRepository,
                      public recovery::IRecoveryRepository, public midi::IMidiFileRepository {
public:
    std::vector<midi::MidiEntry> entries;
    std::map<std::string, midi::MidiFile> files;
    int queries = 0;
    std::vector<midi::MidiEntry> list(Page page) override {
        ++queries;
        std::vector<midi::MidiEntry> result;
        for (auto i = page.offset(); i < static_cast<std::int64_t>(entries.size()) && result.size() < static_cast<std::size_t>(page.size); ++i)
            result.push_back(entries[static_cast<std::size_t>(i)]);
        return result;
    }
    std::int64_t count() override { ++queries; return static_cast<std::int64_t>(entries.size()); }
    std::optional<midi::MidiEntry> findBySlug(const std::string& slug) override {
        ++queries;
        for (const auto& entry : entries) if (entry.slug == slug) return entry;
        return std::nullopt;
    }
    std::optional<midi::MidiEntry> findByPublicId(const std::string&) override { return std::nullopt; }
    std::vector<midi::MidiFile> filesFor(std::int64_t) override { return {}; }
    std::optional<person::Person> findById(std::int64_t) override { return std::nullopt; }
    std::optional<person::Person> findPersonByPublicId(const std::string&) override { return std::nullopt; }
    std::vector<std::string> aliasesFor(std::int64_t) override { return {}; }
    std::vector<person::CreditedMidi> midisFor(std::int64_t) override { return {}; }
    std::vector<person::Credit> creditsFor(std::int64_t) override { return {{1, "Fictional creator", "composer"}}; }
    std::vector<person::Person> peopleFor(std::int64_t) override { return {}; }
    std::vector<recovery::HistoricalSource> sourcesFor(std::int64_t) override { return {}; }
    std::vector<recovery::RecoveryEvent> eventsFor(std::int64_t) override { return {}; }
    std::optional<midi::MidiFile> findBySha256(const std::string& hash) override {
        if (auto found = files.find(hash); found != files.end()) return found->second;
        return std::nullopt;
    }
    bool insertIfAbsent(const midi::MidiFile& file) override { return files.emplace(file.sha256, file).second; }
};

class ServiceTest : public testing::Test {
protected:
    MemoryArchive archive;
    recovery::RecoveryService recovery{archive};
    midi::MidiService service{archive, archive, recovery};
};

TEST_F(ServiceTest, MissingMidiHasSpecific404) {
    try { service.getBySlug("missing-midi"); FAIL() << "Expected ApiError"; }
    catch (const ApiError& error) { EXPECT_EQ(error.status, 404); EXPECT_EQ(error.code, "MIDI_NOT_FOUND"); }
}
TEST_F(ServiceTest, InvalidPaginationDoesNotQueryRepository) {
    EXPECT_THROW(service.list({0, 20}), ApiError);
    EXPECT_THROW(service.list({1, 101}), ApiError);
    EXPECT_EQ(archive.queries, 0);
}
TEST_F(ServiceTest, InvalidSlugDoesNotQueryRepository) {
    EXPECT_THROW(service.getBySlug("bad--slug"), ApiError);
    EXPECT_THROW(service.getBySlug("' OR 1=1"), ApiError);
    EXPECT_EQ(archive.queries, 0);
}
TEST_F(ServiceTest, PaginationKeepsTotalAndCredits) {
    midi::MidiEntry first;
    first.id = 1; first.slug = "first";
    midi::MidiEntry second;
    second.id = 2; second.slug = "second";
    archive.entries = {first, second};
    const auto page = service.list({2, 1});
    ASSERT_EQ(page.data.size(), 1u);
    EXPECT_EQ(page.total, 2);
    EXPECT_EQ(page.data[0].entry.slug, "second");
    ASSERT_EQ(page.data[0].credits.size(), 1u);
    EXPECT_EQ(page.data[0].credits[0].role, "composer");
    EXPECT_TRUE(service.list({3, 1}).data.empty());
}
TEST(Pagination, LastAllowedOffsetAndOverflowInput) {
    const Page page{1000000, 100};
    EXPECT_EQ(page.offset(), 99999900);
    EXPECT_THROW(positiveInteger("2147483648", 1000000, "page"), ApiError);
    EXPECT_THROW(positiveInteger("1junk", 1000000, "page"), ApiError);
}

std::span<const std::byte> bytesOf(const std::string& value) {
    return std::as_bytes(std::span(value.data(), value.size()));
}
TEST(Sha256, KnownVectorAndDifferentContents) {
    EXPECT_EQ(storage::sha256(bytesOf("abc")), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    EXPECT_NE(storage::sha256(bytesOf("abc")), storage::sha256(bytesOf("abd")));
}

class StorageTest : public testing::Test {
protected:
    std::filesystem::path directory = std::filesystem::temp_directory_path() /
        ("lostmidi-test-" + std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
    void TearDown() override { std::filesystem::remove_all(directory); }
    void expectReadUnavailable(const storage::IObjectStorage& objects, const std::string& key, std::size_t size) {
        try { (void)objects.read(key, size); FAIL() << "Expected ApiError"; }
        catch (const ApiError& error) {
            EXPECT_EQ(error.status, 503);
            EXPECT_EQ(error.code, "STORAGE_UNAVAILABLE");
            EXPECT_STREQ(error.what(), "Object storage is temporarily unavailable.");
        }
    }
};
TEST_F(StorageTest, DuplicateContentHasOneFileEvenWithDifferentNames) {
    MemoryArchive repository;
    storage::LocalObjectStorage objects(directory);
    midi::MidiFileService service(repository, objects);
    const std::string bytes = "original test bytes";
    const auto first = service.registerFile(1, "first.mid", bytesOf(bytes));
    const auto second = service.registerFile(1, "renamed.mid", bytesOf(bytes));
    EXPECT_FALSE(first.duplicate);
    EXPECT_TRUE(second.duplicate);
    EXPECT_EQ(repository.files.size(), 1u);
    EXPECT_EQ(second.file.originalFilename, "first.mid");
    EXPECT_TRUE(objects.exists(first.file.storageKey));
    objects.remove(first.file.storageKey);
    EXPECT_FALSE(objects.exists(first.file.storageKey));
    EXPECT_TRUE(service.registerFile(1, "retry.mid", bytesOf(bytes)).duplicate);
    EXPECT_TRUE(objects.exists(first.file.storageKey));
}
TEST_F(StorageTest, RejectsWhitespaceOnlyFilenames) {
    MemoryArchive repository;
    storage::LocalObjectStorage objects(directory);
    midi::MidiFileService service(repository, objects);

    EXPECT_THROW(service.registerFile(1, "   ", bytesOf("abc")), ApiError);
    EXPECT_THROW(service.registerFile(1, "\n\t ", bytesOf("abc")), ApiError);
    EXPECT_NO_THROW(service.registerFile(1, "  valid.mid  ", bytesOf("abc")));
    EXPECT_EQ(repository.files.size(), 1u);
}
TEST_F(StorageTest, RejectsTraversalAndMismatchedContent) {
    storage::LocalObjectStorage objects(directory);
    EXPECT_THROW(objects.exists("../outside"), std::invalid_argument);
    EXPECT_THROW(objects.remove("C:/outside"), std::invalid_argument);
    EXPECT_THROW(objects.store(std::string(64, 'a'), bytesOf("abc")), std::invalid_argument);
}
TEST_F(StorageTest, DetectsCorruptionInsteadOfSilentlyAcceptingDuplicate) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("abc"));
    objects.store(key, bytesOf("abc"));
    { std::ofstream output(directory / key, std::ios::binary); output << "bad"; }
    EXPECT_THROW(objects.store(key, bytesOf("abc")), std::runtime_error);
}
TEST_F(StorageTest, ReadReturnsExactBinaryBytesWithoutChangingObject) {
    storage::LocalObjectStorage objects(directory);
    std::string bytes;
    for (unsigned i = 0; i < 256; ++i) bytes.push_back(static_cast<char>(i));
    const auto key = storage::sha256(bytesOf(bytes));
    ASSERT_TRUE(objects.store(key, bytesOf(bytes)));
    const storage::IObjectStorage& reader = objects;
    const auto actual = reader.read(key, bytes.size());
    ASSERT_EQ(actual.size(), bytes.size());
    EXPECT_EQ(actual, bytes);
    EXPECT_TRUE(objects.exists(key));
    EXPECT_FALSE(objects.store(key, bytesOf(bytes)));
    EXPECT_EQ(reader.read(key, bytes.size()), bytes);
}
TEST_F(StorageTest, ReadMissingObjectIsUnavailable) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("abc"));
    expectReadUnavailable(objects, key, 3);
    EXPECT_FALSE(objects.exists(key));
}
TEST_F(StorageTest, ReadRejectsTruncatedAndEmptyObjects) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("abc"));
    ASSERT_TRUE(objects.store(key, bytesOf("abc")));
    std::filesystem::resize_file(directory / key, 2);
    expectReadUnavailable(objects, key, 3);
    std::filesystem::resize_file(directory / key, 0);
    expectReadUnavailable(objects, key, 3);
}
TEST_F(StorageTest, ReadRejectsSameSizeCorruption) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("abc"));
    ASSERT_TRUE(objects.store(key, bytesOf("abc")));
    {
        std::ofstream output(directory / key, std::ios::binary | std::ios::trunc);
        output << "abd";
        output.close();
        ASSERT_TRUE(output);
    }
    ASSERT_EQ(std::filesystem::file_size(directory / key), 3u);
    expectReadUnavailable(objects, key, 3);
}
TEST_F(StorageTest, ReadRejectsExtraBytesEvenWithMatchingPrefix) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("abc"));
    ASSERT_TRUE(objects.store(key, bytesOf("abc")));
    {
        std::ofstream output(directory / key, std::ios::binary | std::ios::app);
        output.put('\0');
        output.close();
        ASSERT_TRUE(output);
    }
    expectReadUnavailable(objects, key, 3);
}
TEST_F(StorageTest, ReadRejectsIncorrectExpectedSize) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("abc"));
    ASSERT_TRUE(objects.store(key, bytesOf("abc")));
    expectReadUnavailable(objects, key, 2);
    expectReadUnavailable(objects, key, 4);
}
TEST_F(StorageTest, ReadAcceptsOneByteAndOneMiB) {
    storage::LocalObjectStorage objects(directory);
    for (const std::size_t size : {std::size_t{1}, std::size_t{1024 * 1024}}) {
        SCOPED_TRACE(size);
        std::string bytes(size, '\0');
        for (std::size_t i = 0; i < size; ++i) bytes[i] = static_cast<char>(i % 256);
        const auto key = storage::sha256(bytesOf(bytes));
        ASSERT_TRUE(objects.store(key, bytesOf(bytes)));
        EXPECT_EQ(objects.read(key, size), bytes);
        // Even one byte beyond the permitted maximum must not be returned.
        std::filesystem::resize_file(directory / key, size + 1);
        expectReadUnavailable(objects, key, size);
    }
}
TEST_F(StorageTest, ReadRejectsInvalidSizesBeforeReading) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("a"));
    ASSERT_TRUE(objects.store(key, bytesOf("a")));
    EXPECT_THROW(objects.read(key, 0), std::invalid_argument);
    EXPECT_THROW(objects.read(key, 1024 * 1024 + 1), std::invalid_argument);
    EXPECT_THROW(objects.read(key, std::numeric_limits<std::size_t>::max()), std::invalid_argument);
}
TEST_F(StorageTest, ReadRejectsInvalidKeys) {
    storage::LocalObjectStorage objects(directory);
    for (const auto& key : {std::string{}, std::string("../outside"), std::string("C:/outside"),
            std::string(63, 'a'), std::string(65, 'a'), std::string(64, 'A'), std::string(64, 'g'),
            std::string(32, 'a') + '\0' + std::string(31, 'a')}) {
        SCOPED_TRACE(key);
        EXPECT_THROW(objects.read(key, 1), std::invalid_argument);
    }
}
TEST_F(StorageTest, ReadRejectsObjectSymlink) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("abc"));
    ASSERT_TRUE(objects.store(key, bytesOf("abc")));
    const auto target = directory / "target";
    std::filesystem::rename(directory / key, target);
    std::error_code error;
    std::filesystem::create_symlink(target, directory / key, error);
    if (error) GTEST_SKIP() << "Symlink creation is unavailable: " << error.message();
    expectReadUnavailable(objects, key, 3);
    // A dangling symlink must be rejected too.
    std::filesystem::remove(target);
    expectReadUnavailable(objects, key, 3);
}
TEST_F(StorageTest, ReadRejectsReplacedRootSymlink) {
    const auto root = directory / "objects";
    storage::LocalObjectStorage objects(root);
    const auto key = storage::sha256(bytesOf("abc"));
    ASSERT_TRUE(objects.store(key, bytesOf("abc")));
    const auto target = directory / "target";
    std::filesystem::rename(root, target);
    std::error_code error;
    std::filesystem::create_directory_symlink(target, root, error);
    if (error) GTEST_SKIP() << "Symlink creation is unavailable: " << error.message();
    expectReadUnavailable(objects, key, 3);
}
TEST_F(StorageTest, ReadRejectsNonRegularObjectPath) {
    storage::LocalObjectStorage objects(directory);
    const auto key = storage::sha256(bytesOf("abc"));
    ASSERT_TRUE(std::filesystem::create_directory(directory / key));
    expectReadUnavailable(objects, key, 3);
}
}  // namespace
