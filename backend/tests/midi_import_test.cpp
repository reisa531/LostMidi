#include <gtest/gtest.h>
#include "midi/MidiImportService.h"
#include "storage/S3ObjectStorage.h"
#include "common/Json.h"
#include <map>

using namespace lostmidi;
namespace {
using Bytes = std::vector<std::byte>;
Bytes bytes(std::initializer_list<unsigned> values) {
    Bytes result; for (auto value : values) result.push_back(static_cast<std::byte>(value)); return result;
}
void number(Bytes& out, std::size_t n, unsigned count) {
    while (count) out.push_back(static_cast<std::byte>((n >> (--count * 8)) & 255));
}
Bytes smf(const Bytes& events = bytes({0, 255, 47, 0}), unsigned format = 0, unsigned tracks = 1, unsigned division = 96) {
    auto out = bytes({'M','T','h','d',0,0,0,6}); number(out, format, 2); number(out, tracks, 2); number(out, division, 2);
    for (unsigned i = 0; i < tracks; ++i) {
        auto tag = bytes({'M','T','r','k'}); out.insert(out.end(), tag.begin(), tag.end()); number(out, events.size(), 4);
        out.insert(out.end(), events.begin(), events.end());
    }
    return out;
}
template<class Work> void apiError(Work work, int status, const std::string& code) {
    try { work(); FAIL() << "Expected " << code; }
    catch (const ApiError& e) { EXPECT_EQ(e.status, status); EXPECT_EQ(e.code, code); }
}
TEST(MidiValidation, FormatsTracksTimingAndRunningStatus) {
    for (unsigned format : {0u, 1u, 2u}) for (unsigned timing : {1u, 96u, 32767u, 0xe801u, 0xe701u, 0xe301u, 0xe201u})
        EXPECT_NO_THROW(midi::validateMidi(smf(bytes({0,255,47,0}), format, format ? 2 : 1, timing)));
    auto events = bytes({0,0x90,60,100,0x81,0,61,100,0,0xc0,10,0,11,0,0x80,60,0,0,255,47,0});
    EXPECT_NO_THROW(midi::validateMidi(smf(events)));
    EXPECT_NO_THROW(midi::validateMidi(smf(bytes({0,255,1,2,'h','i',0,0xf0,2,1,0xf7,0,0xf7,1,0x7f,0,255,47,0}))));
}
TEST(MidiValidation, RejectsHeaderChunkAndTimingErrors) {
    for (const auto& input : {Bytes{}, bytes({'P','K',3,4}), smf({},0,0), smf({},0,2), smf({},3), smf({},0,1,0), smf({},0,1,0xe000), smf({},0,1,0xe800)})
        apiError([&] { midi::validateMidi(input); }, 400, "INVALID_MIDI");
    const auto valid = smf();
    for (std::size_t n = 0; n < valid.size(); ++n)
        apiError([&] { midi::validateMidi(std::span(valid).first(n)); }, 400, "INVALID_MIDI");
    auto input = valid; input.push_back(std::byte{0});
    apiError([&] { midi::validateMidi(input); }, 400, "INVALID_MIDI");
    for (std::size_t offset : {0u, 7u, 14u, 21u}) {
        input = valid; input[offset] = std::byte{0xff};
        apiError([&] { midi::validateMidi(input); }, 400, "INVALID_MIDI");
    }
}
TEST(MidiValidation, RejectsMalformedEventsAndMissingEndOfTrack) {
    for (const auto& event : {Bytes{}, bytes({0,60,100}), bytes({0,0x90,60,0x80}), bytes({0,0xf1,0}),
        bytes({0x80,0x80,0x80,0x80,0,255,47,0}), bytes({0,0x90,60,100}), bytes({0,255,47,1,0}),
        bytes({0,255,47,0,0}), bytes({0,255,51,4,0}), bytes({0,255,0x80,0}),
        bytes({0,0xf0,10,0}), bytes({0,0x90,60,100,0,255,1,0,0,60,100,0,255,47,0}),
        bytes({0,0x90,60,100,0,0xf7,0,0,60,100,0,255,47,0})})
        apiError([&] { midi::validateMidi(smf(event)); }, 400, "INVALID_MIDI");
    for (const auto& [type, length] : std::map<unsigned,unsigned>{{0,2},{0x20,1},{0x21,1},{0x51,3},{0x54,5},{0x58,4},{0x59,2}}) {
        auto event = bytes({0,255,type,length}); event.resize(event.size()+length, std::byte{0});
        auto end = bytes({0,255,47,0}); event.insert(event.end(),end.begin(),end.end());
        EXPECT_NO_THROW(midi::validateMidi(smf(event)));
        event[3] = static_cast<std::byte>(length+1);
        apiError([&] { midi::validateMidi(smf(event)); }, 400, "INVALID_MIDI");
    }
}
TEST(MidiValidation, ExactSizeBoundaryAndFilenameRules) {
    // A large, length-delimited text event exercises the inclusive 1 MiB boundary.
    const auto length = midi::maxImportBytes - 32;
    auto events = bytes({0,255,1,static_cast<unsigned>(0x80 | (length >> 14)),
        static_cast<unsigned>(0x80 | ((length >> 7) & 127)),static_cast<unsigned>(length & 127)});
    events.resize(events.size()+length, std::byte{'x'});
    auto end = bytes({0,255,47,0}); events.insert(events.end(),end.begin(),end.end());
    auto valid = smf(events); ASSERT_EQ(valid.size(), midi::maxImportBytes); EXPECT_NO_THROW(midi::validateMidi(valid));
    valid.push_back(std::byte{0}); apiError([&] { midi::validateMidi(valid); }, 413, "FILE_TOO_LARGE");
    for (const auto& name : {std::string("乐曲.MIDI"),std::string("demo + 1.mid"),std::string(251,'a')+".mid"})
        EXPECT_NO_THROW(midi::validateMidiFilename(name));
    for (const auto& name : {std::string{},std::string(" demo.mid"),std::string("demo.mid "),std::string("a/b.mid"),
        std::string("a\\b.mid"),std::string("a.zip"),std::string(252,'a')+".mid",std::string("a\0.mid",6),
        std::string("\xc0\xaf.mid"),std::string("\xed\xa0\x80.mid"),std::string("\xf4\x90\x80\x80.mid"),std::string("\xe4.mid")})
        apiError([&] { midi::validateMidiFilename(name); }, 400, "INVALID_FILE");
}
class FakeRepository : public midi::IMidiImportRepository {
public:
    int reads = 0, writes = 0;
    midi::MidiFile saved;
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
TEST(MidiImport, RejectsWithoutStorageOrRepositoryWrites) {
    FakeRepository repo; FakeStorage storage;
    midi::MidiImportService disabled(repo,storage,false), service(repo,storage,true);
    apiError([&] { disabled.import(1,1,"a.mid",smf(),true); },503,"IMPORT_DISABLED");
    apiError([&] { service.import(1,1,"a.mid",smf(),false); },400,"RIGHTS_CONFIRMATION_REQUIRED");
    apiError([&] { service.import(0,1,"a.mid",smf(),true); },400,"INVALID_INPUT");
    apiError([&] { service.import(1,0,"a.mid",smf(),true); },400,"INVALID_INPUT");
    apiError([&] { service.import(1,1,"a.zip",smf(),true); },400,"INVALID_FILE");
    apiError([&] { service.import(1,1,"a.mid",{},true); },400,"INVALID_MIDI");
    EXPECT_EQ(repo.reads,0); EXPECT_EQ(repo.writes,0); EXPECT_EQ(storage.writes,0);
    EXPECT_NO_THROW(disabled.get(1));
}
TEST(MidiImport, PreservesExactBytesFilenameAndContentIdentity) {
    FakeRepository repo; FakeStorage storage; midi::MidiImportService service(repo,storage,true);
    const auto data = smf(); const auto imported = service.import(42,7,"乐曲.MID",data,true);
    EXPECT_EQ(imported.revision,8); EXPECT_FALSE(imported.duplicate);
    EXPECT_EQ(repo.saved.midiId,42); EXPECT_EQ(repo.saved.originalFilename,"乐曲.MID");
    EXPECT_EQ(repo.saved.fileSize,data.size()); EXPECT_EQ(repo.saved.sha256,storage::sha256(data));
    EXPECT_EQ(storage.storedKey,repo.saved.sha256); EXPECT_EQ(storage.stored,data);
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
