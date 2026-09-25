#include <gtest/gtest.h>
#include "midi/MidiImportService.h"
#include "midi/MidiFileService.h"
#include "storage/LocalObjectStorage.h"
#include "storage/S3ObjectStorage.h"
#include "auth/Password.h"
#include "common/Json.h"
#include <fstream>
#include <map>

using namespace lostmidi;
namespace {
using Bytes = std::vector<std::byte>;
Bytes bytes(std::initializer_list<unsigned> values) {
    Bytes result; for (auto value : values) result.push_back(static_cast<std::byte>(value)); return result;
}
Bytes binaryData() {
    Bytes result; for (unsigned i = 0; i < 256; ++i) result.push_back(static_cast<std::byte>(i)); return result;
}
const std::vector<std::string> filenames{"乐曲.mid", "track.mp3", "lossless.flac", "sound.ogg", "sample.wav", "raw.bin", "no-extension"};
const std::vector<std::string> unsafeFilenames{
    "", ".", "..", " demo.mid", "demo.mid ", "a/b.mid", "a\\b.mid", "\tdemo", "demo\n", "a\rb",
    std::string(256,'a'), std::string("a\0.mid",6), "a\x7f.bin", "a\xc2\x85.bin",
    "\xc0\xaf.mid", "\xed\xa0\x80.mid", "\xf4\x90\x80\x80.mid", "\xe4.mid", "\x80.bin"};
template<class Work> void apiError(Work work, int status, const std::string& code) {
    try { work(); FAIL() << "Expected " << code; }
    catch (const ApiError& e) { EXPECT_EQ(e.status, status); EXPECT_EQ(e.code, code); }
}
TEST(FileValidation, AcceptsArbitraryNonemptyBytesWithoutParsing) {
    for (const auto& input : {bytes({0}), bytes({255}), bytes({'P','K',3,4}),
            bytes({'M','T','h','d'}), bytes({'M','T','h','d',255,0,128}), binaryData()}) {
        const auto original = input;
        EXPECT_NO_THROW(midi::validateFileContent(input));
        EXPECT_EQ(input, original);
    }
    apiError([] { midi::validateFileContent({}); }, 400, "INVALID_FILE");
}
TEST(FileValidation, InclusiveFifteenMillionByteBoundary) {
    ASSERT_EQ(midi::maxImportBytes, 15'000'000u);
    Bytes input(15'000'000, std::byte{0xff});
    EXPECT_NO_THROW(midi::validateFileContent(input));
    input.push_back(std::byte{0});
    apiError([&] { midi::validateFileContent(input); }, 413, "FILE_TOO_LARGE");
}
TEST(FileValidation, AllowsAnyExtensionAndPreservesFilenameSafetyRules) {
    for (const auto& name : filenames) EXPECT_NO_THROW(midi::validateFilename(name));
    for (const auto& name : {std::string("乐曲.MIDI"), std::string("demo + 1.mid"), std::string("a.zip"),
            std::string(".hidden"), std::string("..demo"), std::string(255,'a')})
        EXPECT_NO_THROW(midi::validateFilename(name));
    std::string utf8;
    for (int i = 0; i < 85; ++i) utf8 += "曲";
    ASSERT_EQ(utf8.size(),255u);
    EXPECT_NO_THROW(midi::validateFilename(utf8));
    utf8 += 'a';
    apiError([&] { midi::validateFilename(utf8); }, 400, "INVALID_FILE");
    for (const auto& name : unsafeFilenames) {
        SCOPED_TRACE(name);
        apiError([&] { midi::validateFilename(name); }, 400, "INVALID_FILE");
    }
}
class FakeRepository : public midi::IMidiImportRepository {
public:
    int reads = 0, writes = 0;
    midi::MidiFile saved;
    midi::MidiEntry created;
    std::string requestId, fingerprint;
    midi::MidiEntry createWithRequest(const midi::MidiEntry& entry, const std::string& key,
        const std::string& digest, const std::optional<midi::MidiFile>& file, const std::function<void()>& persist) override {
        ++writes; created = entry; created.id = 42; requestId = key; fingerprint = digest;
        if (file) { saved = *file; saved.midiId = created.id; persist(); }
        return created;
    }
    midi::FileEditor fileEditor(std::int64_t id) override { ++reads; midi::FileEditor result; result.entry.id = id; return result; }
    midi::FileImportResult importFile(const midi::MidiFile& file, std::int64_t revision, const std::function<void()>& persist) override {
        ++writes; saved = file; persist(); return {file,false,revision+1};
    }
    std::size_t cleanupImports(const std::function<void(const std::string&)>&) override { return 0; }
};
class FakeStorage : public storage::IObjectStorage {
public:
    int writes = 0; Bytes stored; std::string storedKey;
    bool store(const std::string& key, std::span<const std::byte> data) override { ++writes; storedKey = key; stored.assign(data.begin(),data.end()); return true; }
    bool exists(const std::string&) const override { return false; }
    void remove(const std::string&) override {}
    std::string read(const std::string&, std::size_t) const override { return std::string(reinterpret_cast<const char*>(stored.data()), stored.size()); }
};
constexpr auto creationId = "01234567-89ab-4cde-8fab-0123456789ab";
midi::MidiEntry creationEntry() {
    midi::MidiEntry entry; entry.slug = "new-entry"; entry.title = "New entry";
    entry.archiveStatus = "lost"; entry.copyrightStatus = "unknown"; entry.distributionPermission = "restricted";
    return entry;
}
TEST(MidiCreationBase64, AcceptsOnlyCanonicalAlphabetPaddingAndPadBits) {
    EXPECT_EQ(midi::decodeMidiContentBase64("AAECA/7/"), bytes({0,1,2,3,254,255}));
    EXPECT_EQ(midi::decodeMidiContentBase64("Zg=="), bytes({'f'}));
    EXPECT_EQ(midi::decodeMidiContentBase64("Zm8="), bytes({'f','o'}));
    EXPECT_EQ(midi::decodeMidiContentBase64("Zm9v"), bytes({'f','o','o'}));
    for (const auto* input : {"", "Zg", "Zg=", "Zg===", "Zg==\n", " Zg==", "Z g=", "Zg==Zg==", "====", "=AAA", "AA=A", "AA==AAAA", "-AAA", "_AAA", "Zh==", "Zm9=", "data:audio/midi;base64,Zg=="})
        apiError([&] { midi::decodeMidiContentBase64(input); },400,"INVALID_FILE");
    apiError([&] { midi::decodeMidiContentBase64(std::string("AA\0A",4)); },400,"INVALID_FILE");
}
TEST(MidiCreationBase64, EnforcesDecimalSizeBoundaryWithCanonicalPadding) {
    ASSERT_EQ(midi::maxImportBytes, 15'000'000u);
    // 15,000,000 is divisible by three: the inclusive boundary has no padding.
    const auto prefix = std::string(20'000'000 - 4, 'A');
    EXPECT_EQ(midi::decodeMidiContentBase64(prefix + "AA==").size(), 14'999'998u);
    EXPECT_EQ(midi::decodeMidiContentBase64(prefix + "AAA=").size(), 14'999'999u);
    EXPECT_EQ(midi::decodeMidiContentBase64(prefix + "AAAA"), Bytes(15'000'000, std::byte{0}));
    for (const auto* suffix : {"AAAAAA==", "AAAAAAA=", "AAAAAAAA"})
        apiError([&] { midi::decodeMidiContentBase64(prefix + suffix); },413,"FILE_TOO_LARGE");
    // Pad bits must remain canonical even at the maximum encoded length.
    for (const auto* suffix : {"AB==", "AAB="})
        apiError([&] { midi::decodeMidiContentBase64(prefix + suffix); },400,"INVALID_FILE");
}
TEST(MidiCreation, RejectsInvalidRequestsBeforeAnyRepositoryOrStorageAccess) {
    FakeRepository repo; FakeStorage storage;
    midi::MidiImportService service(repo,storage,true), disabled(repo,storage,false);
    const auto entry = creationEntry(); const midi::MidiCreationFile file{"a.mid",binaryData(),true};
    for (const auto* id : {"", "01234567-89AB-4cde-8fab-0123456789ab", "01234567-89ab-1cde-8fab-0123456789ab",
        "01234567-89ab-4cde-7fab-0123456789ab", "01234567-89ab-4cde-8fab-0123456789abx", "0123456789ab4cde8fab0123456789ab"})
        apiError([&] { service.create(entry,id,file); },400,"INVALID_INPUT");
    auto invalid = entry; invalid.title = " ";
    apiError([&] { service.create(invalid,creationId,file); },400,"INVALID_INPUT");
    apiError([&] { disabled.create(entry,creationId,file); },503,"IMPORT_DISABLED");
    auto upload = file; upload.rightsConfirmed = false;
    apiError([&] { service.create(entry,creationId,upload); },400,"RIGHTS_CONFIRMATION_REQUIRED");
    upload = file; upload.filename = "../a.mid";
    apiError([&] { service.create(entry,creationId,upload); },400,"INVALID_FILE");
    upload = file; upload.bytes.clear();
    apiError([&] { service.create(entry,creationId,upload); },400,"INVALID_FILE");
    upload.bytes.resize(midi::maxImportBytes + 1);
    apiError([&] { service.create(entry,creationId,upload); },413,"FILE_TOO_LARGE");
    EXPECT_EQ(repo.reads,0); EXPECT_EQ(repo.writes,0); EXPECT_EQ(storage.writes,0);
}
TEST(MidiCreation, NormalizesMetadataAndSupportsDisabledMetadataOnlyPath) {
    FakeRepository repo; FakeStorage storage; midi::MidiImportService service(repo,storage,false);
    auto entry = creationEntry(); entry.title = " \tNew entry\r\n"; entry.description = ""; entry.license = "";
    const auto created = service.create(entry,creationId);
    EXPECT_EQ(created.id,42); EXPECT_EQ(created.title,"New entry"); EXPECT_FALSE(created.description); EXPECT_FALSE(created.license);
    EXPECT_EQ(created.archiveStatus,"lost"); EXPECT_EQ(created.distributionPermission,"restricted");
    EXPECT_EQ(repo.writes,1); EXPECT_EQ(repo.reads,0); EXPECT_EQ(storage.writes,0); EXPECT_EQ(repo.requestId,creationId);
    const auto digest = repo.fingerprint;
    service.create(creationEntry(),"01234567-89ab-4cde-afab-0123456789ab");
    EXPECT_EQ(repo.fingerprint,digest); EXPECT_EQ(digest.size(),64u);
    EXPECT_EQ(digest.find_first_not_of("0123456789abcdef"),std::string::npos);
}
TEST(MidiCreation, FingerprintCoversEveryEditableFieldAndOptionalFile) {
    FakeRepository repo; FakeStorage storage; midi::MidiImportService service(repo,storage,true);
    const auto original = creationEntry(); service.create(original,creationId); const auto digest = repo.fingerprint;
    const std::vector<std::function<void(midi::MidiEntry&)>> changes{
        [](auto& e) { e.slug = "other-entry"; }, [](auto& e) { e.title = "Other title"; },
        [](auto& e) { e.description = "Description"; }, [](auto& e) { e.estimatedYear = 1999; },
        [](auto& e) { e.archiveStatus = "archived"; }, [](auto& e) { e.copyrightStatus = "licensed"; },
        [](auto& e) { e.license = "License"; }, [](auto& e) { e.rightsHolder = "Holder"; },
        [](auto& e) { e.distributionPermission = "unknown"; }};
    for (const auto& change : changes) {
        auto entry = original; change(entry); service.create(entry,creationId); EXPECT_NE(repo.fingerprint,digest);
    }
    midi::MidiCreationFile file{"乐曲.MID",binaryData(),true}; service.create(original,creationId,file);
    const auto withFile = repo.fingerprint; EXPECT_NE(withFile,digest);
    EXPECT_EQ(repo.saved.originalFilename,file.filename); EXPECT_EQ(repo.saved.sha256,storage::sha256(file.bytes));
    EXPECT_EQ(repo.saved.storageKey,repo.saved.sha256); EXPECT_TRUE(repo.saved.publicDistributionConfirmed);
    EXPECT_EQ(storage.stored,file.bytes); EXPECT_EQ(repo.created.distributionPermission,"restricted"); EXPECT_EQ(repo.created.archiveStatus,"lost");
    file.filename = "renamed.mp3"; service.create(original,creationId,file); EXPECT_NE(repo.fingerprint,withFile);
    file.filename = "乐曲.MID"; file.bytes.push_back(std::byte{0xff});
    service.create(original,creationId,file); EXPECT_NE(repo.fingerprint,withFile);
    // Delimiter-looking text must not move a boundary between adjacent fields.
    auto a = original, b = original; a.license = "a:1:b"; a.rightsHolder = "c"; b.license = "a"; b.rightsHolder = "b:1:c";
    service.create(a,creationId); const auto boundary = repo.fingerprint;
    service.create(b,creationId); EXPECT_NE(repo.fingerprint,boundary);
}
TEST(MidiImport, RejectsWithoutStorageOrRepositoryWrites) {
    FakeRepository repo; FakeStorage storage;
    midi::MidiImportService disabled(repo,storage,false), service(repo,storage,true);
    apiError([&] { disabled.import(1,1,"a.mid",binaryData(),true); },503,"IMPORT_DISABLED");
    apiError([&] { service.import(1,1,"a.mid",binaryData(),false); },400,"RIGHTS_CONFIRMATION_REQUIRED");
    apiError([&] { service.import(0,1,"a.mid",binaryData(),true); },400,"INVALID_INPUT");
    apiError([&] { service.import(1,0,"a.mid",binaryData(),true); },400,"INVALID_INPUT");
    for (const auto& name : unsafeFilenames) {
        SCOPED_TRACE(name);
        apiError([&] { service.import(1,1,name,binaryData(),true); },400,"INVALID_FILE");
        apiError([&] { service.create(creationEntry(),creationId,midi::MidiCreationFile{name,binaryData(),true}); },400,"INVALID_FILE");
    }
    apiError([&] { service.import(1,1,"a.mid",{},true); },400,"INVALID_FILE");
    const Bytes oversized(15'000'001);
    apiError([&] { service.import(1,1,"a.bin",oversized,true); },413,"FILE_TOO_LARGE");
    EXPECT_EQ(repo.reads,0); EXPECT_EQ(repo.writes,0); EXPECT_EQ(storage.writes,0);
    EXPECT_NO_THROW(disabled.get(1));
}
TEST(MidiImport, PreservesEveryExtensionAndRawBytesForImportAndCreation) {
    FakeRepository repo; FakeStorage storage; midi::MidiImportService service(repo,storage,true);
    const auto data = binaryData();
    for (const auto& name : filenames) {
        SCOPED_TRACE(name);
        const auto imported = service.import(42,7,name,data,true);
        EXPECT_EQ(imported.revision,8); EXPECT_FALSE(imported.duplicate);
        EXPECT_EQ(repo.saved.midiId,42); EXPECT_EQ(repo.saved.originalFilename,name);
        EXPECT_EQ(repo.saved.fileSize,data.size()); EXPECT_EQ(repo.saved.sha256,storage::sha256(data));
        EXPECT_TRUE(repo.saved.publicDistributionConfirmed);
        EXPECT_EQ(storage.storedKey,repo.saved.sha256); EXPECT_EQ(storage.stored,data);
        service.create(creationEntry(),creationId,midi::MidiCreationFile{name,data,true});
        EXPECT_EQ(repo.saved.originalFilename,name); EXPECT_EQ(repo.saved.fileSize,data.size());
        EXPECT_EQ(repo.saved.sha256,storage::sha256(data)); EXPECT_EQ(storage.storedKey,repo.saved.sha256);
        EXPECT_EQ(storage.stored,data); EXPECT_TRUE(repo.saved.publicDistributionConfirmed);
        EXPECT_EQ(repo.created.distributionPermission,"restricted");
    }
}
TEST(MidiImport, ImportAndCreationPreserveInclusiveLimit) {
    ASSERT_EQ(midi::maxImportBytes,15'000'000u);
    FakeRepository repo; FakeStorage storage; midi::MidiImportService service(repo,storage,true);
    const midi::MidiCreationFile upload{"limit.bin",Bytes(15'000'000,std::byte{0xff}),true};
    const auto digest = storage::sha256(upload.bytes);
    service.import(42,7,upload.filename,upload.bytes,true);
    EXPECT_EQ(repo.saved.fileSize,15'000'000u); EXPECT_EQ(repo.saved.sha256,digest);
    EXPECT_EQ(storage.stored,upload.bytes);
    service.create(creationEntry(),creationId,upload);
    EXPECT_EQ(repo.saved.fileSize,15'000'000u); EXPECT_EQ(repo.saved.sha256,digest);
    EXPECT_EQ(storage.stored,upload.bytes);
}
TEST(MidiDownload, ConsentAndRestrictionsControlPublicAvailability) {
    midi::MidiDetail detail;
    midi::MidiFile file; file.id = 3; file.midiId = 1; file.storageKey = "hidden-storage-key";
    detail.files.push_back(file);
    EXPECT_FALSE(midi::downloadAllowed(detail.entry, file));
    detail.entry.distributionPermission = "permission_granted";
    EXPECT_FALSE(midi::downloadAllowed(detail.entry, file));
    file.publicDistributionConfirmed = true;
    for (const auto& permission : {std::optional<std::string>{}, std::optional<std::string>{"unknown"}, std::optional<std::string>{"permission_granted"}}) {
        detail.entry.distributionPermission = permission;
        EXPECT_TRUE(midi::downloadAllowed(detail.entry, file));
    }
    for (const auto* permission : {"restricted", "metadata_only"}) {
        detail.entry.distributionPermission = permission;
        EXPECT_FALSE(midi::downloadAllowed(detail.entry, file));
    }
    detail.entry.distributionPermission = "unknown";
    detail.files[0] = file;
    const auto json = toJson(detail);
    EXPECT_TRUE(json["files"][0]["download_available"].asBool());
    EXPECT_FALSE(json["files"][0].isMember("storage_key"));
    EXPECT_FALSE(json["files"][0].isMember("private_archive_confirmed"));
    detail.entry.distributionPermission = "restricted";
    EXPECT_FALSE(toJson(detail)["files"][0]["download_available"].asBool());
}
class FakeFileRepository : public midi::IMidiFileRepository {
public:
    int reads = 0, writes = 0;
    std::optional<midi::MidiFile> saved;
    std::optional<midi::MidiFile> findBySha256(const std::string& digest) override {
        ++reads; return saved && saved->sha256 == digest ? saved : std::nullopt;
    }
    bool insertIfAbsent(const midi::MidiFile& file) override { ++writes; saved = file; return true; }
};
TEST(FileRegistration, PreservesRawFilesAndUsesSharedValidationBeforeRepositoryAccess) {
    for (const auto& name : filenames) {
        SCOPED_TRACE(name);
        FakeFileRepository repo; FakeStorage storage; midi::MidiFileService service(repo,storage);
        const auto data = binaryData();
        const auto result = service.registerFile(42,name,data);
        EXPECT_FALSE(result.duplicate); EXPECT_EQ(result.file.originalFilename,name);
        EXPECT_EQ(result.file.fileSize,data.size()); EXPECT_EQ(result.file.sha256,storage::sha256(data));
        EXPECT_EQ(storage.stored,data); EXPECT_EQ(storage.storedKey,result.file.sha256);
        const auto duplicate = service.registerFile(42,"renamed",data);
        EXPECT_TRUE(duplicate.duplicate); EXPECT_EQ(duplicate.file.originalFilename,name); EXPECT_EQ(repo.writes,1);
    }
    FakeFileRepository repo; FakeStorage storage; midi::MidiFileService service(repo,storage);
    for (const auto& name : unsafeFilenames)
        apiError([&] { service.registerFile(42,name,binaryData()); },400,"INVALID_FILE");
    apiError([&] { service.registerFile(0,"raw",binaryData()); },400,"INVALID_FILE");
    apiError([&] { service.registerFile(42,"empty",{}); },400,"INVALID_FILE");
    Bytes data(15'000'001,std::byte{0xff});
    apiError([&] { service.registerFile(42,"oversized",data); },413,"FILE_TOO_LARGE");
    EXPECT_EQ(repo.reads,0); EXPECT_EQ(repo.writes,0); EXPECT_EQ(storage.writes,0);
    data.pop_back();
    const auto result = service.registerFile(42,"limit",data);
    EXPECT_EQ(result.file.fileSize,15'000'000u); EXPECT_EQ(result.file.sha256,storage::sha256(data));
    EXPECT_EQ(storage.stored,data);
}
class FileStorageTest : public ::testing::Test {
protected:
    std::filesystem::path directory;
    void SetUp() override { directory = std::filesystem::temp_directory_path()/("lostmidi-file-test-"+auth::randomToken()); }
    void TearDown() override {
        std::error_code error; std::filesystem::remove_all(directory,error); EXPECT_FALSE(error);
    }
};
TEST_F(FileStorageTest, InclusiveLimitRoundTripsAndRetriesWithoutOverwriting) {
    ASSERT_EQ(midi::maxImportBytes,15'000'000u);
    storage::LocalObjectStorage objects(directory);
    for (const std::size_t size : {std::size_t{1},std::size_t{15'000'000}}) {
        std::string content(size,'\0');
        for (std::size_t i = 0; i < size; ++i) content[i] = static_cast<char>(i % 256);
        const auto data = std::as_bytes(std::span(content)); const auto key = storage::sha256(data);
        EXPECT_TRUE(objects.store(key,data));
        EXPECT_EQ(objects.read(key,size),content);
        EXPECT_FALSE(objects.store(key,data));
        EXPECT_EQ(objects.read(key,size),content);
        auto changed = content; changed[0] = '\x7f';
        EXPECT_THROW(objects.store(key,std::as_bytes(std::span(changed))),std::invalid_argument);
        EXPECT_EQ(objects.read(key,size),content);
    }
}
TEST_F(FileStorageTest, RejectsEmptyOversizedAndCorruptObjectsWithoutReplacingThem) {
    storage::LocalObjectStorage objects(directory);
    const Bytes empty, oversized(15'000'001);
    for (const auto* data : {&empty,&oversized}) {
        const auto key = storage::sha256(*data);
        EXPECT_THROW(objects.store(key,*data),std::invalid_argument);
        EXPECT_THROW(objects.read(key,data->size()),std::invalid_argument);
        EXPECT_FALSE(objects.exists(key));
    }
    const auto data = binaryData(); const auto key = storage::sha256(data);
    ASSERT_TRUE(objects.store(key,data));
    {
        std::fstream corrupt(directory/key,std::ios::binary|std::ios::in|std::ios::out);
        corrupt.put('\x7f'); ASSERT_TRUE(corrupt);
    }
    apiError([&] { objects.read(key,data.size()); },503,"STORAGE_UNAVAILABLE");
    EXPECT_THROW(objects.store(key,data),std::runtime_error);
    apiError([&] { objects.read(key,data.size()); },503,"STORAGE_UNAVAILABLE");
    std::filesystem::resize_file(directory/key,data.size()-1);
    apiError([&] { objects.read(key,data.size()); },503,"STORAGE_UNAVAILABLE");
    EXPECT_THROW(objects.store(key,data),std::runtime_error);
}
TEST(S3Storage, RejectsInvalidContentAndSizesBeforeNetworkAccess) {
    const storage::S3Config config{"https://storage.invalid","us-east-1","bucket","test-access","test-secret","archive",true};
    storage::S3ObjectStorage objects(config);
    const Bytes empty, oversized(15'000'001);
    for (const auto* data : {&empty,&oversized}) {
        const auto key = storage::sha256(*data);
        EXPECT_THROW(objects.store(key,*data),std::invalid_argument);
        EXPECT_THROW(objects.read(key,data->size()),std::invalid_argument);
    }
    EXPECT_THROW(objects.store(std::string(64,'a'),binaryData()),std::invalid_argument);
}
TEST(S3Signing, FixedIndependentPythonHmacVectors) {
    // Public synthetic fixture; expected signatures calculated independently with Python hashlib/hmac.
    storage::S3Config config{"https://example.org","us-east-1","bucket","test-access","test-secret-not-a-credential","archive",true};
    const std::map<std::string,std::string> signatures{
        {"GET","8468c512895ff27c49094db6e844f327fe847059e646294e2821b311fc6f59c9"},
        {"HEAD","fde85016c42f3fa89cca92cba095b7d49eb34f26ace22e7c836f83d413404908"},
        {"PUT","c786691a36c5895f59bb6af8b09503684a79f437d1a010299269decb0c4e70b5"},
        {"DELETE","3ac5662991cf455e889f8dcc34a13e03e904b32d54e82541a08bcb20189e9df3"}};
    for (const auto& [verb, signature] : signatures) {
        auto payload = verb == "PUT" ? bytes({'h','e','l','l','o'}) : Bytes{};
        auto headers = storage::signS3(config,verb,"bucket.example.org","/archive/"+std::string(64,'a'),storage::sha256(payload),"20260922T120000Z");
        EXPECT_TRUE(headers.at("authorization").ends_with("Signature="+signature));
        EXPECT_TRUE(headers.at("authorization").starts_with("AWS4-HMAC-SHA256 Credential=test-access/20260922/us-east-1/s3/aws4_request"));
        if (verb=="PUT") { EXPECT_EQ(headers.at("x-amz-acl"),"private"); EXPECT_EQ(headers.at("if-none-match"),"*"); EXPECT_EQ(headers.at("content-type"),"application/octet-stream"); EXPECT_NE(headers.at("authorization").find("SignedHeaders=content-type;"),std::string::npos); }
        else { EXPECT_FALSE(headers.contains("x-amz-acl")); EXPECT_FALSE(headers.contains("if-none-match")); EXPECT_FALSE(headers.contains("content-type")); }
        EXPECT_EQ(headers.at("authorization").find(config.secretKey),std::string::npos);
    }
}
TEST(S3Configuration, RejectsUnsafeOriginsAndPathsBeforeNetworkAccess) {
    const storage::S3Config good{"https://s3.example.org","us-east-1","bucket","test-access","test-secret","archive",true};
    for (const auto& endpoint : {"http://example.org","https://user:pass@example.org","https://example.org/path","https://example.org?token=value"}) {
        auto config = good; config.endpoint = endpoint; EXPECT_THROW(storage::S3ObjectStorage{config},std::runtime_error);
    }
    for (const auto& prefix : {"","../archive","a//b","/a","a/","a?x"}) {
        auto config = good; config.prefix = prefix; EXPECT_THROW(storage::S3ObjectStorage{config},std::runtime_error);
    }
}
} // namespace
