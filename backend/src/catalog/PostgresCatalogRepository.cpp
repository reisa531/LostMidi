#include "catalog/PostgresCatalogRepository.h"
#include "common/Transaction.h"
#include <unordered_map>

namespace lostmidi::catalog {
namespace {
// Keep this predicate aligned with midi::downloadAllowed. Counts describe works
// and physical file records, never storage availability or administrator state.
const std::string downloadable =
    "f.private_archive_confirmed AND COALESCE(m.distribution_permission,'unknown') "
    "NOT IN ('restricted','metadata_only')";
const std::string entryColumns =
    "m.id,m.public_id,m.slug,m.title,m.estimated_year,m.estimated_date,m.archive_status,"
    "to_char(m.updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at";
const std::string entryWhere =
    " FROM midi_entries m WHERE m.deleted_at IS NULL AND ($1::text='' OR m.archive_status=$1) "
    "AND ($2::bigint=0 OR EXISTS(SELECT 1 FROM midi_credits c JOIN people p ON p.id=c.person_id AND p.deleted_at IS NULL WHERE c.midi_id=m.id AND c.person_id=$2)) "
    "AND ($3::text='' OR EXISTS(SELECT 1 FROM historical_sources s WHERE s.midi_id=m.id AND s.website_name COLLATE \"C\"=$3)) "
    "AND (NOT $4::boolean OR NOT EXISTS(SELECT 1 FROM midi_credits c JOIN people p ON p.id=c.person_id AND p.deleted_at IS NULL WHERE c.midi_id=m.id)) "
    "AND (NOT $5::boolean OR NOT EXISTS(SELECT 1 FROM historical_sources s WHERE s.midi_id=m.id)) "
    "AND ($6::text='' OR m.title ILIKE $6 ESCAPE '!' OR m.slug ILIKE $6 ESCAPE '!' "
    "OR EXISTS(SELECT 1 FROM midi_credits c JOIN people p ON p.id=c.person_id "
    "LEFT JOIN person_aliases a ON a.person_id=p.id WHERE c.midi_id=m.id "
    "AND p.deleted_at IS NULL AND (p.display_name ILIKE $6 ESCAPE '!' OR a.alias ILIKE $6 ESCAPE '!')) "
    "OR EXISTS(SELECT 1 FROM historical_sources s WHERE s.midi_id=m.id AND s.website_name ILIKE $6 ESCAPE '!')) ";

std::string likePattern(const std::string& search) {
    std::string result = "%";
    for (const char c : search) {
        if (c == '!' || c == '%' || c == '_') result += '!';
        result += c;
    }
    result += '%';
    return result;
}

class Snapshot {
public:
    Snapshot(const drogon::orm::DbClientPtr& db, const PostgresCatalogRepository::QueryObserver& observer)
        : transaction_(db), observer_(observer) {
        exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    }
    template<class... Args> drogon::orm::Result exec(const std::string& sql, Args&&... args) {
        if (observer_) observer_(sql);
        return transaction_.db->execSqlSync(sql, std::forward<Args>(args)...);
    }
    void finish() { transaction_.commit(); }
private:
    TransactionScope transaction_;
    const PostgresCatalogRepository::QueryObserver& observer_;
};
CatalogEntry entryFrom(const drogon::orm::Row& row) {
    CatalogEntry entry;
    entry.id = row["id"].as<std::int64_t>();
    entry.publicId = row["public_id"].as<std::string>();
    entry.slug = row["slug"].as<std::string>();
    entry.title = row["title"].as<std::string>();
    entry.estimatedYear = nullable<int>(row["estimated_year"]);
    entry.estimatedDate = nullable<std::string>(row["estimated_date"]);
    entry.archiveStatus = row["archive_status"].as<std::string>();
    entry.updatedAt = row["updated_at"].as<std::string>();
    return entry;
}
template<class T> std::string idsFor(const std::vector<T>& values) {
    std::string ids = "{";
    for (const auto& value : values) {
        if (ids.size() > 1) ids += ',';
        ids += std::to_string(value.id);
    }
    return ids + '}';
}
// Exactly three batch SELECTs regardless of page length. The bound bigint array
// contains only selected entries (at most 100, or 12 for the two overview lists).
// No detailed entry/file/source blobs are selected, even for internal enrichment.
void enrich(Snapshot& snapshot, std::vector<CatalogEntry>& entries, std::vector<CatalogEntry>* other = nullptr) {
    std::unordered_map<std::int64_t, std::vector<CatalogEntry*>> selected;
    for (auto& entry : entries) selected[entry.id].push_back(&entry);
    if (other) for (auto& entry : *other) selected[entry.id].push_back(&entry);
    if (selected.empty()) return;
    std::string ids = "{";
    for (const auto& [id, targets] : selected) {
        (void)targets;
        if (ids.size() > 1) ids += ',';
        ids += std::to_string(id);
    }
    ids += '}';
    for (const auto& row : snapshot.exec(
        "SELECT c.midi_id,c.person_id,p.display_name,c.role FROM midi_credits c "
        "JOIN people p ON p.id=c.person_id AND p.deleted_at IS NULL WHERE c.midi_id=ANY($1::bigint[]) "
        "ORDER BY c.midi_id,c.person_id,c.role COLLATE \"C\"", ids)) {
        Credit credit{row["person_id"].as<std::int64_t>(), row["display_name"].as<std::string>(), row["role"].as<std::string>()};
        for (auto* entry : selected.at(row["midi_id"].as<std::int64_t>())) entry->credits.push_back(credit);
    }
    for (const auto& row : snapshot.exec(
        "SELECT DISTINCT midi_id,website_name COLLATE \"C\" AS website_name FROM historical_sources "
        "WHERE midi_id=ANY($1::bigint[]) ORDER BY midi_id,website_name", ids)) {
        for (auto* entry : selected.at(row["midi_id"].as<std::int64_t>()))
            entry->sources.push_back(row["website_name"].as<std::string>());
    }
    for (const auto& row : snapshot.exec(
        "SELECT f.midi_id,count(*) AS files,count(*) FILTER(WHERE " + downloadable + ") AS downloadable "
        "FROM midi_files f JOIN midi_entries m ON m.id=f.midi_id WHERE f.midi_id=ANY($1::bigint[]) GROUP BY f.midi_id", ids)) {
        for (auto* entry : selected.at(row["midi_id"].as<std::int64_t>())) {
            entry->fileCount = row["files"].as<std::int64_t>();
            entry->downloadableFileCount = row["downloadable"].as<std::int64_t>();
        }
    }
}
// One row per (group, work); multiple credit roles and duplicate source records
// cannot inflate counts. Unassigned groups are synthesized only from real works.
std::string memberships(const std::string& by) {
    if (by == "author") return
        "WITH membership AS (SELECT DISTINCT c.midi_id,p.id::text COLLATE \"C\" AS key,"
        "p.display_name COLLATE \"C\" AS label FROM midi_credits c JOIN people p ON p.id=c.person_id "
        "JOIN midi_entries m0 ON m0.id=c.midi_id AND m0.deleted_at IS NULL WHERE p.deleted_at IS NULL "
        "UNION ALL SELECT m.id,'' AS key,'未署名' AS label FROM midi_entries m "
        "WHERE m.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM midi_credits c JOIN people p ON p.id=c.person_id AND p.deleted_at IS NULL WHERE c.midi_id=m.id)) ";
    return
        "WITH membership AS (SELECT DISTINCT s.midi_id,s.website_name COLLATE \"C\" AS key,"
        "s.website_name COLLATE \"C\" AS label FROM historical_sources s "
        "JOIN midi_entries m0 ON m0.id=s.midi_id AND m0.deleted_at IS NULL "
        "UNION ALL SELECT m.id,'' AS key,'来源待补' AS label FROM midi_entries m "
        "WHERE m.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM historical_sources s WHERE s.midi_id=m.id)) ";
}
}

PageResult<CatalogEntry> PostgresCatalogRepository::entries(const EntryQuery& query) {
    Snapshot snapshot(db_, observer_);
    PageResult<CatalogEntry> result;
    result.page = query.page;
    const auto status = query.status.value_or("");
    const auto person = query.personId.value_or(0);
    const auto source = query.source.value_or("");
    const auto search = query.search.empty() ? std::string{} : likePattern(query.search);
    result.total = snapshot.exec("SELECT count(*) AS total" + entryWhere,
        status, person, source, query.missingAuthor, query.missingSource, search)[0]["total"].as<std::int64_t>();
    const std::string order = query.sort == "title" ? "m.title COLLATE \"C\" ASC,m.id ASC" : "m.updated_at DESC,m.id DESC";
    for (const auto& row : snapshot.exec("SELECT " + entryColumns + entryWhere + "ORDER BY " + order + " LIMIT $7 OFFSET $8",
        status, person, source, query.missingAuthor, query.missingSource, search, static_cast<std::int64_t>(query.page.size), query.page.offset()))
        result.data.push_back(entryFrom(row));
    enrich(snapshot, result.data);
    snapshot.finish();
    return result;
}

Overview PostgresCatalogRepository::overview() {
    Snapshot snapshot(db_, observer_);
    Overview result;
    const auto rows = snapshot.exec(
        "SELECT count(*) AS entries,"
        "(SELECT count(*) FROM people WHERE deleted_at IS NULL) AS people,(SELECT count(*) FROM midi_files f JOIN midi_entries m0 ON m0.id=f.midi_id WHERE m0.deleted_at IS NULL) AS files,"
        "(SELECT count(DISTINCT s.website_name COLLATE \"C\") FROM historical_sources s JOIN midi_entries m0 ON m0.id=s.midi_id WHERE m0.deleted_at IS NULL) AS sources,"
        "count(*) FILTER(WHERE EXISTS(SELECT 1 FROM midi_files f WHERE f.midi_id=m.id)) AS with_files,"
        "count(*) FILTER(WHERE EXISTS(SELECT 1 FROM midi_files f WHERE f.midi_id=m.id AND " + downloadable + ")) AS downloadable,"
        "count(*) FILTER(WHERE m.archive_status='archived') AS archived,"
        "count(*) FILTER(WHERE m.archive_status='partially_recovered') AS partially_recovered,"
        "count(*) FILTER(WHERE m.archive_status='lost') AS lost,"
        "count(*) FILTER(WHERE m.archive_status='uncertain') AS uncertain FROM midi_entries m WHERE m.deleted_at IS NULL");
    const auto& row = rows[0];
    result.stats = {row["entries"].as<std::int64_t>(), row["people"].as<std::int64_t>(), row["files"].as<std::int64_t>(),
        row["with_files"].as<std::int64_t>(), row["downloadable"].as<std::int64_t>(), row["sources"].as<std::int64_t>(),
        row["archived"].as<std::int64_t>(), row["partially_recovered"].as<std::int64_t>(),
        row["lost"].as<std::int64_t>(), row["uncertain"].as<std::int64_t>()};
    for (const auto& recent : snapshot.exec("SELECT " + entryColumns + " FROM midi_entries m WHERE m.deleted_at IS NULL ORDER BY m.updated_at DESC,m.id DESC LIMIT 6"))
        result.recent.push_back(entryFrom(recent));
    for (const auto& attention : snapshot.exec("SELECT " + entryColumns + " FROM midi_entries m "
        "WHERE m.deleted_at IS NULL AND m.archive_status!='archived' ORDER BY m.updated_at DESC,m.id DESC LIMIT 6"))
        result.needsAttention.push_back(entryFrom(attention));
    enrich(snapshot, result.recent, &result.needsAttention);
    snapshot.finish();
    return result;
}

PageResult<Person> PostgresCatalogRepository::people(const PersonQuery& query) {
    const auto page = query.page;
    const auto search = query.search.empty() ? std::string{} : likePattern(query.search);
    Snapshot snapshot(db_, observer_);
    PageResult<Person> result;
    result.page = page;
    result.total = snapshot.exec("SELECT count(*) AS total FROM people p WHERE p.deleted_at IS NULL AND ($1::text='' OR p.display_name ILIKE $1 ESCAPE '!' "
        "OR EXISTS(SELECT 1 FROM person_aliases a WHERE a.person_id=p.id AND a.alias ILIKE $1 ESCAPE '!'))", search)[0]["total"].as<std::int64_t>();
    for (const auto& row : snapshot.exec("SELECT id,public_id,display_name,biography,summary,updated_at FROM people p WHERE p.deleted_at IS NULL AND ($1::text='' OR p.display_name ILIKE $1 ESCAPE '!' "
        "OR EXISTS(SELECT 1 FROM person_aliases a WHERE a.person_id=p.id AND a.alias ILIKE $1 ESCAPE '!')) "
        "ORDER BY display_name COLLATE \"C\",id LIMIT $2 OFFSET $3",
        search, static_cast<std::int64_t>(page.size), page.offset())) {
        Person person;
        person.id = row["id"].as<std::int64_t>();
        person.publicId = row["public_id"].as<std::string>();
        person.displayName = row["display_name"].as<std::string>();
        person.biography = nullable<std::string>(row["biography"]);
        person.summary = nullable<std::string>(row["summary"]);
        person.updatedAt = row["updated_at"].as<std::string>();
        result.data.push_back(std::move(person));
    }
    if (!result.data.empty()) {
        const auto ids = idsFor(result.data);
        std::unordered_map<std::int64_t, Person*> selected;
        for (auto& person : result.data) selected[person.id] = &person;
        for (const auto& row : snapshot.exec("SELECT person_id,alias FROM person_aliases WHERE person_id=ANY($1::bigint[]) ORDER BY person_id,alias COLLATE \"C\",id", ids))
            selected.at(row["person_id"].as<std::int64_t>())->aliases.push_back(row["alias"].as<std::string>());
        for (const auto& row : snapshot.exec("SELECT c.person_id,count(DISTINCT c.midi_id) AS midis FROM midi_credits c "
            "JOIN midi_entries m ON m.id=c.midi_id AND m.deleted_at IS NULL WHERE c.person_id=ANY($1::bigint[]) GROUP BY c.person_id", ids))
            selected.at(row["person_id"].as<std::int64_t>())->midiCount = row["midis"].as<std::int64_t>();
    }
    snapshot.finish();
    return result;
}

PageResult<Group> PostgresCatalogRepository::groups(const GroupQuery& query) {
    Snapshot snapshot(db_, observer_);
    PageResult<Group> result;
    result.page = query.page;
    const auto members = memberships(query.by);
    result.total = snapshot.exec(members + "SELECT count(*) AS total FROM (SELECT key,label FROM membership GROUP BY key,label) groups")[0]["total"].as<std::int64_t>();
    // Aggregate and paginate in PostgreSQL; only the requested group page reaches C++.
    for (const auto& row : snapshot.exec(members +
        "SELECT g.key,g.label,count(*) AS entries,"
        "count(*) FILTER(WHERE EXISTS(SELECT 1 FROM midi_files f WHERE f.midi_id=m.id)) AS with_files,"
        "count(*) FILTER(WHERE EXISTS(SELECT 1 FROM midi_files f WHERE f.midi_id=m.id AND " + downloadable + ")) AS downloadable "
        "FROM membership g JOIN midi_entries m ON m.id=g.midi_id AND m.deleted_at IS NULL GROUP BY g.key,g.label "
        "ORDER BY g.label COLLATE \"C\",g.key COLLATE \"C\" LIMIT $1 OFFSET $2",
        static_cast<std::int64_t>(query.page.size), query.page.offset())) {
        result.data.push_back({row["key"].as<std::string>(), row["label"].as<std::string>(),
            row["entries"].as<std::int64_t>(), row["with_files"].as<std::int64_t>(), row["downloadable"].as<std::int64_t>()});
    }
    snapshot.finish();
    return result;
}
}  // namespace lostmidi::catalog
