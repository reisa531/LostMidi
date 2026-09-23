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

using namespace lostmidi;
namespace {
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
        if (!url || !*url) GTEST_SKIP() << "Set LOSTMIDI_TEST_DATABASE_URL to a disposable database migrated through 006.";
        owner = drogon::orm::DbClient::newPgClient(url,1); owner->setTimeout(10.0);
        schema = "import_test_"+auth::randomToken().substr(0,24);
        owner->execSqlSync("CREATE SCHEMA "+schema); created = true;
        for (const auto* table : {"midi_entries","midi_files","midi_import_objects"})
            owner->execSqlSync("CREATE TABLE "+schema+"."+table+" (LIKE public."+table+" INCLUDING ALL)");
        std::string connection = url;
        if (connection.starts_with("postgres://") || connection.starts_with("postgresql://"))
            connection += (connection.find('?')==std::string::npos ? "?" : "&")+std::string("options=-csearch_path%3D")+schema;
        else connection += " options='-csearch_path="+schema+"'";
        db = drogon::orm::DbClient::newPgClient(connection,4); db->setTimeout(10.0);
        db->execSqlSync("ALTER TABLE midi_files ADD FOREIGN KEY(midi_id) REFERENCES midi_entries(id) ON DELETE CASCADE");
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
};
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
