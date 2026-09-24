#include <gtest/gtest.h>
#include "midi/PostgresMidiRepository.h"
#include "midi/MidiService.h"
#include "person/PostgresPersonRepository.h"
#include "recovery/PostgresRecoveryRepository.h"
#include "storage/LocalObjectStorage.h"
#include "auth/Password.h"
#include "common/Transaction.h"
#include "common/Json.h"
#include <cstdlib>
#include <filesystem>
#include <future>
#include <memory>
#include <atomic>

using namespace lostmidi;
namespace {
constexpr auto requestA = "01234567-89ab-4cde-8fab-0123456789ab";
constexpr auto requestB = "01234567-89ab-4cde-afab-0123456789ab";
class ObservedStorage : public storage::IObjectStorage {
public:
    explicit ObservedStorage(storage::IObjectStorage& objects) : objects_(objects) {}
    std::atomic<int> writes{0}, removals{0};
    std::function<void()> afterStore;
    bool store(const std::string& key, std::span<const std::byte> content) override {
        ++writes; const auto stored = objects_.store(key,content);
        if (afterStore) afterStore();
        return stored;
    }
    bool exists(const std::string& key) const override { return objects_.exists(key); }
    void remove(const std::string& key) override { ++removals; objects_.remove(key); }
    std::string read(const std::string& key, std::size_t size) const override { return objects_.read(key,size); }
private:
    storage::IObjectStorage& objects_;
};
template<class Work> void apiError(Work work, int status, const std::string& code) {
    try { work(); FAIL() << "Expected " << code; }
    catch (const ApiError& e) { EXPECT_EQ(e.status,status); EXPECT_EQ(e.code,code); }
}
class ImportPostgres : public ::testing::Test {
protected:
    drogon::orm::DbClientPtr owner, db;
    std::unique_ptr<midi::PostgresMidiRepository> repo;
    std::unique_ptr<storage::LocalObjectStorage> objects;
    std::unique_ptr<midi::MidiImportService> service;
    std::string schema;
    std::filesystem::path directory;
    bool created = false;
    std::int64_t first = 0, second = 0;
    void SetUp() override {
        const char* url = std::getenv("LOSTMIDI_TEST_DATABASE_URL");
        if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a disposable database migrated through 007.";
        owner = drogon::orm::DbClient::newPgClient(url,1); owner->setTimeout(10.0);
        schema = "import_test_"+auth::randomToken().substr(0,24);
        owner->execSqlSync("CREATE SCHEMA "+schema); created = true;
        for (const auto* table : {"midi_entries","midi_files","midi_import_objects","midi_creation_requests"})
            owner->execSqlSync("CREATE TABLE "+schema+"."+table+" (LIKE public."+table+" INCLUDING ALL)");
        std::string connection = url;
        if (connection.starts_with("postgres://") || connection.starts_with("postgresql://"))
            connection += (connection.find('?')==std::string::npos ? "?" : "&")+std::string("options=-csearch_path%3D")+schema;
        else connection += " options='-csearch_path="+schema+"'";
        db = drogon::orm::DbClient::newPgClient(connection,4); db->setTimeout(10.0);
        db->execSqlSync("ALTER TABLE midi_files ADD FOREIGN KEY(midi_id) REFERENCES midi_entries(id) ON DELETE CASCADE");
        db->execSqlSync("ALTER TABLE midi_creation_requests ADD FOREIGN KEY(midi_id) REFERENCES midi_entries(id) ON DELETE SET NULL");
        db->execSqlSync("CREATE TRIGGER midi_entries_updated_at BEFORE UPDATE ON midi_entries FOR EACH ROW EXECUTE FUNCTION public.set_midi_entry_updated_at()");
        first = db->execSqlSync("INSERT INTO midi_entries(slug,title,distribution_permission) VALUES('first','First','restricted') RETURNING id")[0][0].as<std::int64_t>();
        second = db->execSqlSync("INSERT INTO midi_entries(slug,title) VALUES('second','Second') RETURNING id")[0][0].as<std::int64_t>();
        directory = std::filesystem::temp_directory_path()/schema;
        objects = std::make_unique<storage::LocalObjectStorage>(directory);
        repo = std::make_unique<midi::PostgresMidiRepository>(db);
        service = std::make_unique<midi::MidiImportService>(*repo,*objects,true);
    }
    void TearDown() override {
        service.reset(); repo.reset(); objects.reset(); db.reset();
        if (created) {
            try { owner->execSqlSync("DROP SCHEMA "+schema+" CASCADE"); }
            catch (...) { ADD_FAILURE() << "Could not remove isolated import schema."; }
        }
        if (!directory.empty()) { std::error_code error; std::filesystem::remove_all(directory,error); EXPECT_FALSE(error); }
    }
    std::vector<std::byte> data(unsigned note = 60) {
        std::vector<std::byte> result;
        for (auto b : {77u,84u,104u,100u,0u,0u,0u,6u,0u,0u,0u,1u,0u,96u,
            77u,84u,114u,107u,0u,0u,0u,8u,0u,0x90u,note,100u,0u,255u,47u,0u}) result.push_back(static_cast<std::byte>(b));
        return result;
    }
    midi::MidiFile file(unsigned note = 60) {
        midi::MidiFile f; const auto content = data(note); f.midiId=first; f.originalFilename="fixture.mid";
        f.fileSize=content.size(); f.sha256=storage::sha256(content); f.storageKey=f.sha256; return f;
    }
    bool journal(const std::string& key) { return !db->execSqlSync("SELECT 1 FROM midi_import_objects WHERE sha256=$1",key).empty(); }
    void age(const std::string& key) { db->execSqlSync("UPDATE midi_import_objects SET touched_at=CURRENT_TIMESTAMP-INTERVAL '25 hours' WHERE sha256=$1",key); }
    midi::MidiEntry entry(const std::string& slug = "created-entry") {
        midi::MidiEntry e; e.slug=slug; e.title="Created entry"; e.description="Original description"; e.estimatedYear=1998;
        e.archiveStatus="lost"; e.copyrightStatus="licensed"; e.license="Original license";
        e.rightsHolder="Original holder"; e.distributionPermission="unknown"; return e;
    }
    midi::MidiCreationFile upload(unsigned note = 60) { return {"下载+乐曲.mid",data(note),true}; }
    void counts(std::int64_t entries, std::int64_t files, std::int64_t receipts, std::int64_t journals) {
        const auto rows = db->execSqlSync("SELECT (SELECT count(*) FROM midi_entries) AS entries, "
            "(SELECT count(*) FROM midi_files) AS files, (SELECT count(*) FROM midi_creation_requests) AS receipts, "
            "(SELECT count(*) FROM midi_import_objects) AS journals");
        const auto row = rows[0];
        EXPECT_EQ(row["entries"].as<std::int64_t>(),entries); EXPECT_EQ(row["files"].as<std::int64_t>(),files);
        EXPECT_EQ(row["receipts"].as<std::int64_t>(),receipts); EXPECT_EQ(row["journals"].as<std::int64_t>(),journals);
    }
};
TEST_F(ImportPostgres, CreationMetadataOnlyIsRepeatableWhileImportsDisabledAndLegacyStillWorks) {
    midi::MidiImportService disabled(*repo,*objects,false);
    auto input=entry(); input.title="  Created entry\t"; input.description="";
    const auto saved=disabled.create(input,requestA);
    EXPECT_EQ(saved.revision,1); EXPECT_EQ(saved.title,"Created entry"); EXPECT_FALSE(saved.description);
    counts(3,0,1,0);
    input.title="Created entry"; input.description.reset();
    EXPECT_EQ(disabled.create(input,requestA).id,saved.id);
    auto edited=saved; edited.slug="edited-slug"; edited.title="Edited title";
    const auto current=repo->update(saved.id,edited);
    const auto replay=disabled.create(input,requestA);
    EXPECT_EQ(replay.id,saved.id); EXPECT_EQ(replay.title,current.title); EXPECT_EQ(replay.slug,current.slug); EXPECT_EQ(replay.revision,2);
    counts(3,0,1,0);
    auto different=input; different.title="Different payload";
    apiError([&] { disabled.create(different,requestA); },409,"IDEMPOTENCY_CONFLICT");
    midi::MidiWriteService legacy(*repo);
    EXPECT_GT(legacy.create(entry("legacy-entry")).id,0); counts(4,0,1,0);
}
TEST_F(ImportPostgres, CreationWithFileIsAtomicDownloadableAndPreservesSubmittedMetadata) {
    const auto input=entry(); const auto uploaded=upload();
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true);
    observed.afterStore=[&] {
        EXPECT_TRUE(journal(storage::sha256(uploaded.bytes)));
        // The object is already durable, but no creation record is visible yet.
        counts(2,0,0,1); EXPECT_FALSE(repo->findBySlug(input.slug));
    };
    const auto saved=create.create(input,requestA,uploaded);
    EXPECT_EQ(saved.revision,1); EXPECT_EQ(saved.archiveStatus,input.archiveStatus); EXPECT_EQ(saved.copyrightStatus,input.copyrightStatus);
    EXPECT_EQ(saved.license,input.license); EXPECT_EQ(saved.rightsHolder,input.rightsHolder); EXPECT_EQ(saved.distributionPermission,input.distributionPermission);
    EXPECT_EQ(saved.description,input.description); EXPECT_EQ(saved.estimatedYear,input.estimatedYear); counts(3,1,1,0);
    const auto files=repo->filesFor(saved.id); ASSERT_EQ(files.size(),1u);
    EXPECT_TRUE(files[0].publicDistributionConfirmed); EXPECT_EQ(files[0].originalFilename,uploaded.filename);
    EXPECT_EQ(files[0].sha256,storage::sha256(uploaded.bytes)); EXPECT_EQ(files[0].fileSize,uploaded.bytes.size());
    person::PostgresPersonRepository people(db); recovery::PostgresRecoveryRepository historyRepository(db);
    recovery::RecoveryService history(historyRepository); midi::MidiService downloads(*repo,people,history);
    const auto downloadable=downloads.fileForDownload(saved.slug,files[0].id);
    const auto content=objects->read(downloadable.storageKey,static_cast<std::size_t>(downloadable.fileSize));
    EXPECT_EQ(content,std::string(reinterpret_cast<const char*>(uploaded.bytes.data()),uploaded.bytes.size()));
    EXPECT_EQ(toJson(saved)["revision"].asInt64(),1); EXPECT_EQ(observed.writes.load(),1); EXPECT_EQ(observed.removals.load(),0);
    auto restricted=saved; restricted.distributionPermission="metadata_only"; repo->update(saved.id,restricted);
    apiError([&] { downloads.fileForDownload(saved.slug,files[0].id); },403,"DOWNLOAD_NOT_ALLOWED");
}
TEST_F(ImportPostgres, CreationReplayReturnsCurrentEntryWithoutWritingStorageOrChangingFiles) {
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true);
    const auto input=entry(); const auto uploaded=upload(); const auto saved=create.create(input,requestA,uploaded);
    const auto original=repo->filesFor(saved.id)[0];
    auto edit=saved; edit.slug="renamed-entry"; edit.title="Changed after creation"; edit.distributionPermission="restricted";
    edit.archiveStatus="archived"; edit.rightsHolder="Edited holder";
    const auto updated=repo->update(saved.id,edit);
    EXPECT_EQ(service->import(saved.id,updated.revision,"additional.mid",data(61),true).revision,3);
    observed.afterStore=[] { throw std::runtime_error("Replay must not touch storage"); };
    const auto replay=create.create(input,requestA,uploaded);
    EXPECT_EQ(replay.id,saved.id); EXPECT_EQ(replay.revision,3); EXPECT_EQ(replay.title,edit.title); EXPECT_EQ(replay.slug,edit.slug);
    EXPECT_EQ(replay.distributionPermission,edit.distributionPermission); EXPECT_EQ(replay.rightsHolder,edit.rightsHolder); EXPECT_EQ(replay.archiveStatus,edit.archiveStatus);
    const auto files=repo->filesFor(saved.id); ASSERT_EQ(files.size(),2u); EXPECT_EQ(files[0].id,original.id);
    EXPECT_EQ(files[0].originalFilename,original.originalFilename); EXPECT_TRUE(files[0].publicDistributionConfirmed);
    EXPECT_EQ(observed.writes.load(),1); EXPECT_EQ(observed.removals.load(),0); counts(3,2,1,0);
    // Even if an object is missing, create replay must not silently act as import/repair.
    objects->remove(original.storageKey);
    EXPECT_EQ(create.create(input,requestA,uploaded).id,saved.id); EXPECT_FALSE(objects->exists(original.storageKey)); counts(3,2,1,0);
}
TEST_F(ImportPostgres, CreationChangedPayloadConflictsBeforeSlugOrFileOwnershipChecks) {
    const auto input=entry(); const auto uploaded=upload(); service->create(input,requestA,uploaded);
    const std::vector<std::function<void(midi::MidiEntry&)>> changes{
        [](auto& e) { e.slug="other-slug"; }, [](auto& e) { e.title="Other"; }, [](auto& e) { e.description.reset(); },
        [](auto& e) { e.estimatedYear=2000; }, [](auto& e) { e.archiveStatus="archived"; },
        [](auto& e) { e.copyrightStatus="unknown"; }, [](auto& e) { e.license.reset(); },
        [](auto& e) { e.rightsHolder.reset(); }, [](auto& e) { e.distributionPermission="restricted"; }};
    for (const auto& change : changes) {
        auto changed=input; change(changed);
        apiError([&] { service->create(changed,requestA,uploaded); },409,"IDEMPOTENCY_CONFLICT");
    }
    auto renamed=uploaded; renamed.filename="renamed.mid";
    apiError([&] { service->create(input,requestA,renamed); },409,"IDEMPOTENCY_CONFLICT");
    apiError([&] { service->create(input,requestA,upload(61)); },409,"IDEMPOTENCY_CONFLICT");
    apiError([&] { service->create(input,requestA); },409,"IDEMPOTENCY_CONFLICT");
    EXPECT_FALSE(objects->exists(storage::sha256(data(61)))); counts(3,1,1,2);
    // Matching replay may remove only the journal for the referenced object.
    service->create(input,requestA,uploaded); counts(3,1,1,1);
    EXPECT_TRUE(journal(storage::sha256(data(61))));
}
TEST_F(ImportPostgres, CreationMetadataReceiptCannotBeReusedToAttachFile) {
    const auto saved=service->create(entry(),requestA);
    apiError([&] { service->create(entry(),requestA,upload()); },409,"IDEMPOTENCY_CONFLICT");
    EXPECT_TRUE(repo->filesFor(saved.id).empty()); EXPECT_FALSE(objects->exists(storage::sha256(data()))); counts(3,0,1,1);
}
TEST_F(ImportPostgres, CreationSlugAndCrossEntryHashConflictsLeaveNoHalfCreatedEntry) {
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true);
    apiError([&] { create.create(entry("first"),requestA); },409,"SLUG_CONFLICT"); counts(2,0,0,0);
    apiError([&] { create.create(entry("first"),requestA,upload()); },409,"SLUG_CONFLICT"); counts(2,0,0,1);
    EXPECT_EQ(observed.writes.load(),0); EXPECT_FALSE(objects->exists(storage::sha256(data())));
    service->import(first,1,"owned.mid",data(),true);
    apiError([&] { create.create(entry(),requestA,upload()); },409,"FILE_OWNERSHIP_CONFLICT");
    EXPECT_FALSE(repo->findBySlug("created-entry")); counts(2,1,0,1);
    // Failed attempts do not reserve the request key; a corrected payload can succeed.
    const auto saved=create.create(entry(),requestA,upload(61));
    EXPECT_EQ(saved.revision,1); counts(3,2,1,1); EXPECT_EQ(observed.writes.load(),1); EXPECT_EQ(observed.removals.load(),0);
}
TEST_F(ImportPostgres, CreationStorageFailureAfterWriteRetainsJournalAndRetryCreatesExactlyOnce) {
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true);
    const auto input=entry(); const auto uploaded=upload(); const auto digest=storage::sha256(uploaded.bytes);
    observed.afterStore=[&] { EXPECT_TRUE(journal(digest)); throw std::runtime_error("injected timeout after storing bytes"); };
    EXPECT_THROW(create.create(input,requestA,uploaded),std::runtime_error);
    counts(2,0,0,1); EXPECT_FALSE(repo->findBySlug(input.slug)); EXPECT_TRUE(objects->exists(digest)); EXPECT_EQ(observed.removals.load(),0);
    observed.afterStore={};
    const auto saved=create.create(input,requestA,uploaded); EXPECT_EQ(saved.revision,1); counts(3,1,1,0);
    EXPECT_EQ(create.create(input,requestA,uploaded).id,saved.id); counts(3,1,1,0); EXPECT_EQ(observed.writes.load(),2);
}
TEST_F(ImportPostgres, CreationDeferredCommitFailureRollsBackEntryFileAndReceipt) {
    db->execSqlSync("CREATE FUNCTION reject_creation_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected creation commit failure'; RETURN NEW; END; $$");
    db->execSqlSync("CREATE CONSTRAINT TRIGGER reject_creation_commit AFTER INSERT ON midi_creation_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_creation_commit()");
    const auto input=entry(); const auto uploaded=upload(); const auto digest=storage::sha256(uploaded.bytes);
    EXPECT_THROW(service->create(input,requestA),drogon::orm::DrogonDbException); counts(2,0,0,0);
    EXPECT_THROW(service->create(input,requestA,uploaded),drogon::orm::DrogonDbException);
    counts(2,0,0,1); EXPECT_TRUE(objects->exists(digest)); EXPECT_FALSE(repo->findBySlug(input.slug));
    db->execSqlSync("DROP TRIGGER reject_creation_commit ON midi_creation_requests");
    const auto saved=service->create(input,requestA,uploaded); counts(3,1,1,0);
    EXPECT_EQ(service->create(input,requestA,uploaded).id,saved.id); counts(3,1,1,0);
}
TEST_F(ImportPostgres, CreationFailureOrphanCanBeCleanedThenSafelyRetried) {
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true);
    const auto digest=storage::sha256(data());
    observed.afterStore=[] { throw std::runtime_error("injected storage response loss"); };
    EXPECT_THROW(create.create(entry(),requestA,upload()),std::runtime_error); counts(2,0,0,1);
    age(digest); EXPECT_EQ(create.cleanup(),1u); EXPECT_FALSE(objects->exists(digest)); counts(2,0,0,0);
    observed.afterStore={}; EXPECT_GT(create.create(entry(),requestA,upload()).id,0); counts(3,1,1,0);
}
TEST_F(ImportPostgres, CreationChecksJournalUnderLockBeforePersisting) {
    // Fault injection models a journal superseded before this transaction acquires
    // its locks. The guard must fail without ever sending bytes to storage.
    db->execSqlSync("CREATE FUNCTION supersede_creation_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM midi_import_objects; RETURN NEW; END; $$");
    db->execSqlSync("CREATE TRIGGER supersede_creation_journal BEFORE INSERT ON midi_entries FOR EACH ROW EXECUTE FUNCTION supersede_creation_journal()");
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true);
    apiError([&] { create.create(entry(),requestA,upload()); },503,"SERVER_BUSY");
    EXPECT_EQ(observed.writes.load(),0); counts(2,0,0,1);
    db->execSqlSync("DROP TRIGGER supersede_creation_journal ON midi_entries");
    EXPECT_GT(create.create(entry(),requestA,upload()).id,0); counts(3,1,1,0);
}
TEST_F(ImportPostgres, CreationReplayDoesNotDiscardUnreferencedJournalOrRecreateRemovedFile) {
    const auto saved=service->create(entry(),requestA,upload()); const auto digest=storage::sha256(data());
    // Isolated fixture mutation models later removal; a creation receipt remains.
    db->execSqlSync("DELETE FROM midi_files WHERE midi_id=$1",saved.id);
    EXPECT_EQ(service->create(entry(),requestA,upload()).id,saved.id); counts(3,0,1,1);
    EXPECT_TRUE(objects->exists(digest)); age(digest); EXPECT_EQ(service->cleanup(),1u); counts(3,0,1,0);
}
TEST_F(ImportPostgres, CreationConcurrentSameRequestReplaysWithoutDuplicateEntriesOrWrites) {
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true);
    const auto input=entry(); const auto uploaded=upload();
    std::promise<void> start; const auto ready=start.get_future().share();
    auto work=[&] { ready.wait(); return create.create(input,requestA,uploaded); };
    auto a=std::async(std::launch::async,work), b=std::async(std::launch::async,work); start.set_value();
    const auto x=a.get(), y=b.get(); EXPECT_EQ(x.id,y.id); EXPECT_EQ(x.revision,1); EXPECT_EQ(y.revision,1);
    for (int round=0; round<8; ++round) {
        auto retryA=std::async(std::launch::async,work), retryB=std::async(std::launch::async,work);
        EXPECT_EQ(retryA.get().id,x.id); EXPECT_EQ(retryB.get().id,x.id);
    }
    counts(3,1,1,0); EXPECT_EQ(observed.writes.load(),1); EXPECT_EQ(observed.removals.load(),0);
    auto metadata=[&] { return create.create(entry("metadata-race"),requestB); };
    auto c=std::async(std::launch::async,metadata), d=std::async(std::launch::async,metadata);
    EXPECT_EQ(c.get().id,d.get().id); counts(4,1,2,0); EXPECT_EQ(observed.writes.load(),1);
}
TEST_F(ImportPostgres, CreationConcurrentChangedRequestPayloadHasOneWinner) {
    std::promise<void> start; const auto ready=start.get_future().share();
    auto work=[&](unsigned note) {
        ready.wait(); try { service->create(entry(),requestA,upload(note)); return std::string("created"); }
        catch (const ApiError& error) { EXPECT_EQ(error.status,409); return error.code; }
    };
    auto a=std::async(std::launch::async,work,60), b=std::async(std::launch::async,work,61); start.set_value();
    const auto x=a.get(), y=b.get();
    EXPECT_TRUE((x=="created" && y=="IDEMPOTENCY_CONFLICT") || (y=="created" && x=="IDEMPOTENCY_CONFLICT"));
    counts(3,1,1,1);
    const auto loser=x=="created" ? 61u : 60u; EXPECT_FALSE(objects->exists(storage::sha256(data(loser))));
}
TEST_F(ImportPostgres, CreationConcurrentDifferentRequestsSameHashHaveOneOwner) {
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true);
    std::promise<void> start; const auto ready=start.get_future().share();
    auto work=[&](const std::string& slug,const std::string& key) {
        ready.wait(); try { create.create(entry(slug),key,upload()); return std::string("created"); }
        catch (const ApiError& error) { EXPECT_EQ(error.status,409); return error.code; }
    };
    auto a=std::async(std::launch::async,work,"race-a",requestA), b=std::async(std::launch::async,work,"race-b",requestB); start.set_value();
    const auto x=a.get(), y=b.get();
    EXPECT_TRUE((x=="created" && y=="FILE_OWNERSHIP_CONFLICT") || (y=="created" && x=="FILE_OWNERSHIP_CONFLICT"));
    EXPECT_EQ(observed.writes.load(),1); EXPECT_FALSE(repo->findBySlug(x=="created" ? "race-b" : "race-a"));
    // Depending on the competing journal's commit order it can be retained; a
    // successful owner replay removes it without another write or metadata edit.
    create.create(entry(x=="created" ? "race-a" : "race-b"),x=="created" ? requestA : requestB,upload());
    counts(3,1,1,0); EXPECT_EQ(observed.writes.load(),1); EXPECT_EQ(observed.removals.load(),0);
}
TEST_F(ImportPostgres, CreationInvalidDisabledAndUnconfirmedFilesPerformNoWrites) {
    const auto input=entry(); const auto uploaded=upload();
    ObservedStorage observed(*objects); midi::MidiImportService create(*repo,observed,true), disabled(*repo,observed,false);
    apiError([&] { disabled.create(input,requestA,uploaded); },503,"IMPORT_DISABLED");
    auto invalid=uploaded; invalid.rightsConfirmed=false;
    apiError([&] { create.create(input,requestA,invalid); },400,"RIGHTS_CONFIRMATION_REQUIRED");
    invalid=uploaded; invalid.filename="../bad.mid";
    apiError([&] { create.create(input,requestA,invalid); },400,"INVALID_FILE");
    invalid=uploaded; invalid.bytes.clear();
    apiError([&] { create.create(input,requestA,invalid); },400,"INVALID_MIDI");
    invalid.bytes.resize(midi::maxImportBytes+1);
    apiError([&] { create.create(input,requestA,invalid); },413,"FILE_TOO_LARGE");
    auto metadata=input; metadata.archiveStatus="invalid";
    apiError([&] { create.create(metadata,requestA,uploaded); },400,"INVALID_INPUT");
    apiError([&] { create.create(input,"not-a-uuid",uploaded); },400,"INVALID_INPUT");
    counts(2,0,0,0); EXPECT_EQ(observed.writes.load(),0); EXPECT_EQ(observed.removals.load(),0);
}
TEST_F(ImportPostgres, CreationReceiptConstraintsRetainDeletedIdentity) {
    EXPECT_THROW(db->execSqlSync("INSERT INTO midi_creation_requests VALUES($1::uuid,$2,$3)",requestA,std::string(64,'A'),first),drogon::orm::DrogonDbException);
    EXPECT_THROW(db->execSqlSync("INSERT INTO midi_creation_requests VALUES($1::uuid,$2,9223372036854775807)",requestA,std::string(64,'a')),drogon::orm::DrogonDbException);
    const auto saved=service->create(entry(),requestA);
    EXPECT_THROW(db->execSqlSync("INSERT INTO midi_creation_requests VALUES($1::uuid,$2,$3)",requestB,std::string(64,'a'),saved.id),drogon::orm::DrogonDbException);
    repo->remove(saved.id, 1); counts(2,0,1,0);
    EXPECT_TRUE(db->execSqlSync("SELECT midi_id FROM midi_creation_requests")[0][0].isNull());
    apiError([&] { service->create(entry(),requestA); },410,"CREATION_DELETED");
    counts(2,0,1,0);
}
TEST_F(ImportPostgres, DeletionJournalsFilesAndPreventsReplayAndUnsafeCleanup) {
    const auto saved = service->create(entry(), requestA, upload());
    const auto key = storage::sha256(upload().bytes);
    apiError([&] { repo->remove(saved.id, 2); },409,"STALE_ENTRY");
    EXPECT_FALSE(journal(key)); EXPECT_TRUE(objects->exists(key));
    {
        TransactionScope other(db);
        other.db->execSqlSync("SELECT pg_advisory_xact_lock(hashtextextended($1,741033))", key);
        apiError([&] { repo->remove(saved.id, 1); },503,"SERVER_BUSY");
        EXPECT_TRUE(repo->findById(saved.id)); EXPECT_FALSE(journal(key));
        other.commit();
    }
    db->execSqlSync("CREATE FUNCTION reject_delete_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$");
    db->execSqlSync("CREATE CONSTRAINT TRIGGER reject_delete_commit AFTER DELETE ON midi_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_delete_commit()");
    EXPECT_ANY_THROW(repo->remove(saved.id, 1));
    EXPECT_TRUE(repo->findById(saved.id)); EXPECT_FALSE(journal(key)); EXPECT_TRUE(objects->exists(key));
    EXPECT_EQ(service->create(entry(), requestA, upload()).id, saved.id);
    db->execSqlSync("DROP TRIGGER reject_delete_commit ON midi_entries");
    repo->remove(saved.id, 1);
    EXPECT_FALSE(repo->findById(saved.id)); EXPECT_TRUE(repo->filesFor(saved.id).empty());
    EXPECT_TRUE(journal(key)); EXPECT_TRUE(objects->exists(key));
    apiError([&] { service->create(entry(), requestA, upload()); },410,"CREATION_DELETED");
    EXPECT_EQ(service->cleanup(), 0u);
    service->import(second, 1, "reused.mid", upload().bytes, true);
    age(key);
    EXPECT_EQ(service->cleanup(), 0u); EXPECT_TRUE(objects->exists(key));
    repo->remove(second, 2); age(key);
    EXPECT_EQ(service->cleanup(), 1u); EXPECT_FALSE(objects->exists(key));
    EXPECT_FALSE(journal(key));
}
TEST_F(ImportPostgres, IdempotentSameEntryConflictsAndRightsRemainUnchanged) {
    const auto content=data(); const auto before=service->get(first).entry;
    const auto saved=service->import(first,1,"乐曲.mid",content,true);
    EXPECT_EQ(saved.revision,2); EXPECT_FALSE(saved.duplicate); EXPECT_TRUE(objects->exists(saved.file.sha256));
    EXPECT_FALSE(journal(saved.file.sha256));
    EXPECT_TRUE(db->execSqlSync("SELECT private_archive_confirmed FROM midi_files")[0][0].as<bool>());
    auto duplicate=service->import(first,1,"other-name.mid",content,true);
    EXPECT_TRUE(duplicate.duplicate); EXPECT_EQ(duplicate.file.id,saved.file.id); EXPECT_EQ(duplicate.file.originalFilename,"乐曲.mid");
    EXPECT_EQ(duplicate.revision,2); EXPECT_EQ(service->get(first).files.size(),1u);
    // Missing object after a committed metadata record is repaired by exact-byte retry.
    objects->remove(saved.file.sha256);
    EXPECT_TRUE(service->import(first,1,"repair.mid",content,true).duplicate);
    EXPECT_TRUE(objects->exists(saved.file.sha256));
    apiError([&] { service->import(second,1,"other.mid",content,true); },409,"FILE_OWNERSHIP_CONFLICT");
    EXPECT_TRUE(service->get(second).files.empty()); EXPECT_EQ(service->get(second).entry.revision,1);
    apiError([&] { service->import(first,1,"new.mid",data(61),true); },409,"STALE_ENTRY");
    EXPECT_FALSE(objects->exists(storage::sha256(data(61))));
    const auto after=service->get(first).entry;
    EXPECT_EQ(after.distributionPermission,before.distributionPermission); EXPECT_EQ(after.copyrightStatus,before.copyrightStatus);
    EXPECT_EQ(after.archiveStatus,before.archiveStatus); EXPECT_EQ(after.rightsHolder,before.rightsHolder);
    const auto json=toJson(saved.file);
    EXPECT_FALSE(json.isMember("storage_key")); EXPECT_FALSE(json.isMember("url")); EXPECT_TRUE(json["id"].isString());
    apiError([&] { service->get(9223372036854775807LL); },404,"MIDI_NOT_FOUND");
}
TEST_F(ImportPostgres, PublicDownloadRequiresConsentAndMatchingEntry) {
    person::PostgresPersonRepository people(db);
    recovery::PostgresRecoveryRepository historyRepository(db);
    recovery::RecoveryService history(historyRepository);
    midi::MidiService downloads(*repo, people, history);
    const auto saved = service->import(first, 1, "下载+乐曲.mid", data(), true);
    EXPECT_TRUE(saved.file.publicDistributionConfirmed);
    apiError([&] { downloads.fileForDownload("first", saved.file.id); }, 403, "DOWNLOAD_NOT_ALLOWED");
    db->execSqlSync("UPDATE midi_entries SET distribution_permission='unknown' WHERE id=$1", first);
    const auto file = downloads.fileForDownload("first", saved.file.id);
    EXPECT_EQ(file.originalFilename, "下载+乐曲.mid");
    const auto content = objects->read(file.storageKey, static_cast<std::size_t>(file.fileSize));
    EXPECT_EQ(storage::sha256(std::as_bytes(std::span(content))), file.sha256);
    apiError([&] { downloads.fileForDownload("second", saved.file.id); }, 404, "FILE_NOT_FOUND");
    apiError([&] { downloads.fileForDownload("missing", saved.file.id); }, 404, "MIDI_NOT_FOUND");
    apiError([&] { downloads.fileForDownload("first", 0); }, 400, "INVALID_FILE_ID");
    apiError([&] { downloads.fileForDownload("../first", saved.file.id); }, 400, "INVALID_SLUG");
    db->execSqlSync("UPDATE midi_files SET private_archive_confirmed=FALSE WHERE id=$1", saved.file.id);
    apiError([&] { downloads.fileForDownload("first", saved.file.id); }, 403, "DOWNLOAD_NOT_ALLOWED");
    db->execSqlSync("UPDATE midi_files SET private_archive_confirmed=TRUE, storage_key='legacy/path' WHERE id=$1", saved.file.id);
    apiError([&] { downloads.fileForDownload("first", saved.file.id); }, 503, "STORAGE_UNAVAILABLE");
    db->execSqlSync("UPDATE midi_files SET storage_key=sha256 WHERE id=$1", saved.file.id);
    service = std::make_unique<midi::MidiImportService>(*repo, *objects, false);
    EXPECT_FALSE(service->enabled());
    EXPECT_NO_THROW(downloads.fileForDownload("first", saved.file.id));
    objects->remove(file.storageKey);
    apiError([&] { objects->read(file.storageKey, static_cast<std::size_t>(file.fileSize)); }, 503, "STORAGE_UNAVAILABLE");
}
TEST_F(ImportPostgres, ConcurrentIdenticalAndCompetingRevisionImports) {
    std::promise<void> start; auto ready=start.get_future().share();
    auto work=[&] { ready.wait(); return service->import(first,1,"race.mid",data(),true); };
    auto a=std::async(std::launch::async,work), b=std::async(std::launch::async,work); start.set_value();
    const auto x=a.get(), y=b.get();
    EXPECT_NE(x.duplicate,y.duplicate); EXPECT_EQ(x.file.id,y.file.id); EXPECT_EQ(x.revision,2); EXPECT_EQ(y.revision,2);
    // Repeated journal INSERT/DELETE contention must not hit a non-arbiter unique index.
    for (int round=0; round<16; ++round) {
        auto retryA=std::async(std::launch::async,work), retryB=std::async(std::launch::async,work);
        EXPECT_TRUE(retryA.get().duplicate); EXPECT_TRUE(retryB.get().duplicate);
    }
    auto compete=[&](unsigned note) { try { service->import(first,2,"next.mid",data(note),true); return 200; } catch(const ApiError& e) { return e.status; } };
    auto c=std::async(std::launch::async,compete,61), d=std::async(std::launch::async,compete,62);
    const auto p=c.get(), q=d.get(); EXPECT_TRUE((p==200 && q==409)||(p==409 && q==200));
    EXPECT_EQ(service->get(first).entry.revision,3); EXPECT_EQ(service->get(first).files.size(),2u);
    auto cross=[&](std::int64_t id,std::int64_t revision) { try { service->import(id,revision,"cross.mid",data(63),true); return 200; } catch(const ApiError& e) { EXPECT_EQ(e.code,"FILE_OWNERSHIP_CONFLICT"); return e.status; } };
    auto e=std::async(std::launch::async,cross,first,3), f=std::async(std::launch::async,cross,second,1);
    const auto r=e.get(), s=f.get(); EXPECT_TRUE((r==200 && s==409)||(r==409 && s==200));
}
TEST_F(ImportPostgres, StorageAndSqlFailuresRetainJournalAndAllowRetry) {
    auto f=file(); const auto content=data();
    EXPECT_THROW(repo->importFile(f,1,[&] { EXPECT_TRUE(journal(f.sha256)); objects->store(f.storageKey,content); throw std::runtime_error("injected storage timeout"); }),std::runtime_error);
    EXPECT_TRUE(journal(f.sha256)); EXPECT_TRUE(repo->filesFor(first).empty()); EXPECT_EQ(repo->findById(first)->revision,1);
    f.fileSize=0; // Real SQL CHECK failure after storage succeeds.
    EXPECT_THROW(repo->importFile(f,1,[&] { objects->store(f.storageKey,content); }),drogon::orm::DrogonDbException);
    EXPECT_TRUE(journal(f.sha256)); EXPECT_TRUE(repo->filesFor(first).empty()); EXPECT_EQ(repo->findById(first)->revision,1);
    const auto saved=service->import(first,1,"retry.mid",content,true);
    EXPECT_FALSE(saved.duplicate); EXPECT_EQ(saved.revision,2); EXPECT_FALSE(journal(f.sha256));
}
TEST_F(ImportPostgres, DeferredCommitFailureDoesNotClaimSuccess) {
    db->execSqlSync("CREATE FUNCTION reject_file_commit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected import commit failure'; RETURN NEW; END; $$");
    db->execSqlSync("CREATE CONSTRAINT TRIGGER reject_file_commit AFTER INSERT ON midi_files DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_file_commit()");
    const auto f=file();
    EXPECT_THROW(service->import(first,1,"commit.mid",data(),true),drogon::orm::DrogonDbException);
    EXPECT_TRUE(journal(f.sha256)); EXPECT_TRUE(objects->exists(f.storageKey));
    EXPECT_TRUE(repo->filesFor(first).empty()); EXPECT_EQ(repo->findById(first)->revision,1);
    db->execSqlSync("DROP TRIGGER reject_file_commit ON midi_files");
    EXPECT_EQ(service->import(first,1,"retry.mid",data(),true).revision,2);
    EXPECT_FALSE(journal(f.sha256));
}
TEST_F(ImportPostgres, CleanupOnlyRemovesAgedUnreferencedTrackedObjects) {
    const auto saved=service->import(first,1,"saved.mid",data(),true);
    const auto orphan=file(61), fresh=file(62), untracked=file(63);
    for (const auto& f : {saved.file,orphan,fresh})
        db->execSqlSync("INSERT INTO midi_import_objects(sha256,storage_key) VALUES($1,$1)",f.sha256);
    objects->store(orphan.storageKey,data(61)); objects->store(fresh.storageKey,data(62)); objects->store(untracked.storageKey,data(63));
    age(saved.file.sha256); age(orphan.sha256);
    // Cleanup skips a digest currently held by another transaction.
    {
        TransactionScope lock(db);
        lock.db->execSqlSync("SELECT pg_advisory_xact_lock(hashtextextended($1,741033))",orphan.sha256);
        EXPECT_EQ(service->cleanup(),0u); EXPECT_TRUE(journal(orphan.sha256));
        EXPECT_FALSE(journal(saved.file.sha256)); EXPECT_TRUE(objects->exists(saved.file.storageKey));
        lock.commit();
    }
    // A failed DELETE leaves its journal available for later maintenance.
    EXPECT_THROW(repo->cleanupImports([](const std::string&) { throw std::runtime_error("injected deletion timeout"); }),std::runtime_error);
    EXPECT_TRUE(journal(orphan.sha256));
    EXPECT_EQ(service->cleanup(),1u); EXPECT_FALSE(objects->exists(orphan.storageKey)); EXPECT_FALSE(journal(orphan.sha256));
    EXPECT_TRUE(objects->exists(saved.file.storageKey)); EXPECT_TRUE(objects->exists(fresh.storageKey)); EXPECT_TRUE(objects->exists(untracked.storageKey));
    EXPECT_TRUE(journal(fresh.sha256)); EXPECT_EQ(service->cleanup(),0u);
}
} // namespace
