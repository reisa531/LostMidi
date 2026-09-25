#include "person/PostgresPersonRepository.h"
#include "common/Transaction.h"
#include "common/Error.h"

namespace lostmidi::person {
namespace {
Person personFrom(const drogon::orm::Row& row) {
    return {row["id"].as<std::int64_t>(), row["display_name"].as<std::string>(),
        nullable<std::string>(row["biography"]), row["created_at"].as<std::string>(), row["revision"].as<std::int64_t>()};
}
}
std::optional<Person> PostgresPersonRepository::findById(std::int64_t id) {
    const auto rows = db_->execSqlSync("SELECT * FROM people WHERE id = $1 AND deleted_at IS NULL", id);
    if (rows.empty()) return std::nullopt;
    return personFrom(rows[0]);
}
std::vector<std::string> PostgresPersonRepository::aliasesFor(std::int64_t id) {
    std::vector<std::string> aliases;
    for (const auto& row : db_->execSqlSync("SELECT alias FROM person_aliases WHERE person_id = $1 ORDER BY id", id))
        aliases.push_back(row["alias"].as<std::string>());
    return aliases;
}
std::vector<CreditedMidi> PostgresPersonRepository::midisFor(std::int64_t id) {
    std::vector<CreditedMidi> midis;
    for (const auto& row : db_->execSqlSync(
        "SELECT m.id, m.slug, m.title, c.role FROM midi_entries m "
        "JOIN midi_credits c ON c.midi_id = m.id WHERE c.person_id = $1 AND m.deleted_at IS NULL ORDER BY m.id, c.role", id))
        midis.push_back({row["id"].as<std::int64_t>(), row["slug"].as<std::string>(),
            row["title"].as<std::string>(), row["role"].as<std::string>()});
    return midis;
}
std::vector<Credit> PostgresPersonRepository::creditsFor(std::int64_t midiId) {
    std::vector<Credit> credits;
    for (const auto& row : db_->execSqlSync(
        "SELECT p.id, p.display_name, c.role FROM people p JOIN midi_credits c ON c.person_id = p.id "
        "WHERE c.midi_id = $1 AND p.deleted_at IS NULL ORDER BY p.id, c.role", midiId))
        credits.push_back({row["id"].as<std::int64_t>(), row["display_name"].as<std::string>(), row["role"].as<std::string>()});
    return credits;
}
std::vector<Person> PostgresPersonRepository::peopleFor(std::int64_t midiId) {
    std::vector<Person> people;
    for (const auto& row : db_->execSqlSync(
        "SELECT DISTINCT p.* FROM people p JOIN midi_credits c ON c.person_id = p.id "
        "WHERE c.midi_id = $1 AND p.deleted_at IS NULL ORDER BY p.id", midiId)) people.push_back(personFrom(row));
    return people;
}
}  // namespace lostmidi::person

namespace lostmidi::person {
PersonList PostgresPersonRepository::list(Page page) {
    PersonList result;
    result.total = db_->execSqlSync("SELECT count(*) AS total FROM people WHERE deleted_at IS NULL")[0]["total"].as<std::int64_t>();
    for (const auto& row : db_->execSqlSync("SELECT * FROM people WHERE deleted_at IS NULL ORDER BY id LIMIT $1 OFFSET $2", static_cast<std::int64_t>(page.size), page.offset()))
        result.data.push_back(personFrom(row));
    return result;
}
PersonEdit PostgresPersonRepository::getEditor(std::int64_t id) {
    TransactionScope tx(db_);
    const auto rows = tx.db->execSqlSync("SELECT * FROM people WHERE id=$1 AND deleted_at IS NULL FOR SHARE", id);
    if (rows.empty()) throw ApiError(404, "PERSON_NOT_FOUND", "Person does not exist.");
    PersonEdit result{personFrom(rows[0]), {}};
    for (const auto& row : tx.db->execSqlSync("SELECT alias FROM person_aliases WHERE person_id=$1 ORDER BY id", id))
        result.aliases.push_back(row["alias"].as<std::string>());
    tx.commit();
    return result;
}
PersonEdit PostgresPersonRepository::save(std::int64_t id, const PersonEdit& edit) {
    TransactionScope tx(db_);
    const auto rows = id
        ? tx.db->execSqlSync("UPDATE people SET display_name=$1, biography=NULLIF($2,'') WHERE id=$3 AND revision=$4 AND deleted_at IS NULL RETURNING *",
            edit.person.displayName, edit.person.biography.value_or(""), id, edit.person.revision)
        : tx.db->execSqlSync("INSERT INTO people(display_name,biography) VALUES($1,NULLIF($2,'')) RETURNING *",
            edit.person.displayName, edit.person.biography.value_or(""));
    if (rows.empty()) {
        if (tx.db->execSqlSync("SELECT 1 FROM people WHERE id=$1 AND deleted_at IS NULL", id).empty())
            throw ApiError(404, "PERSON_NOT_FOUND", "Person does not exist.");
        throw ApiError(409, "STALE_PERSON", "Person changed elsewhere. Reload before saving.");
    }
    PersonEdit result{personFrom(rows[0]), edit.aliases};
    tx.db->execSqlSync("DELETE FROM person_aliases WHERE person_id=$1", result.person.id);
    for (const auto& alias : edit.aliases)
        tx.db->execSqlSync("INSERT INTO person_aliases(person_id,alias) VALUES($1,$2)", result.person.id, alias);
    tx.commit();
    return result;
}
void PostgresPersonRepository::remove(std::int64_t id, std::int64_t revision, const std::string& actor) {
    TransactionScope tx(db_);
    tx.db->execSqlSync("SET LOCAL lock_timeout = '5s'");
    const auto rows = tx.db->execSqlSync("SELECT display_name,revision FROM people WHERE id=$1 AND deleted_at IS NULL FOR UPDATE", id);
    if (rows.empty()) throw ApiError(404, "PERSON_NOT_FOUND", "Person does not exist.");
    if (rows[0]["revision"].as<std::int64_t>() != revision)
        throw ApiError(409, "STALE_PERSON", "Person changed elsewhere. Reload before deleting.");
    const auto references = tx.db->execSqlSync(
        "SELECT 1 FROM midi_credits WHERE person_id=$1 UNION ALL SELECT 1 FROM recovery_events WHERE recovered_by=$1 LIMIT 1", id);
    if (!references.empty())
        throw ApiError(409, "PERSON_IN_USE", "Remove this person's credits and recovery references before moving them to the trash.");
    const auto label = rows[0]["display_name"].as<std::string>();
    tx.db->execSqlSync("UPDATE people SET deleted_at=CURRENT_TIMESTAMP,deleted_by=$2 WHERE id=$1", id, actor);
    tx.db->execSqlSync("INSERT INTO admin_audit_log(actor,action,entity_type,entity_id,entity_label) VALUES($1,'delete','person',$2,$3)", actor, id, label);
    tx.commit();
}
CreditEdit PostgresPersonRepository::getCredits(std::int64_t midiId) {
    TransactionScope tx(db_);
    const auto rows = tx.db->execSqlSync("SELECT revision FROM midi_entries WHERE id=$1 AND deleted_at IS NULL FOR SHARE", midiId);
    if (rows.empty()) throw ApiError(404, "MIDI_NOT_FOUND", "MIDI entry does not exist.");
    CreditEdit result{rows[0]["revision"].as<std::int64_t>(), {}};
    for (const auto& row : tx.db->execSqlSync("SELECT p.id,p.display_name,c.role FROM midi_credits c JOIN people p ON p.id=c.person_id WHERE c.midi_id=$1 AND p.deleted_at IS NULL ORDER BY p.id,c.role", midiId))
        result.credits.push_back({row["id"].as<std::int64_t>(), row["display_name"].as<std::string>(), row["role"].as<std::string>()});
    tx.commit();
    return result;
}
CreditEdit PostgresPersonRepository::saveCredits(std::int64_t midiId, const CreditEdit& edit) {
    TransactionScope tx(db_);
    const auto rows = tx.db->execSqlSync("UPDATE midi_entries SET updated_at=updated_at WHERE id=$1 AND revision=$2 AND deleted_at IS NULL RETURNING revision", midiId, edit.revision);
    if (rows.empty()) {
        if (tx.db->execSqlSync("SELECT 1 FROM midi_entries WHERE id=$1 AND deleted_at IS NULL", midiId).empty())
            throw ApiError(404, "MIDI_NOT_FOUND", "MIDI entry does not exist.");
        throw ApiError(409, "STALE_ENTRY", "Entry changed elsewhere. Reload before saving.");
    }
    CreditEdit result{rows[0]["revision"].as<std::int64_t>(), {}};
    tx.db->execSqlSync("DELETE FROM midi_credits WHERE midi_id=$1", midiId);
    for (const auto& credit : edit.credits) {
        const auto person = tx.db->execSqlSync("SELECT display_name FROM people WHERE id=$1 AND deleted_at IS NULL FOR KEY SHARE", credit.personId);
        if (person.empty()) throw ApiError(400, "UNKNOWN_PERSON", "A selected person no longer exists.");
        tx.db->execSqlSync("INSERT INTO midi_credits(midi_id,person_id,role) VALUES($1,$2,$3)", midiId, credit.personId, credit.role);
        result.credits.push_back({credit.personId, person[0]["display_name"].as<std::string>(), credit.role});
    }
    tx.commit();
    return result;
}
}
