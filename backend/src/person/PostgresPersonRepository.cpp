#include "person/PostgresPersonRepository.h"

namespace lostmidi::person {
namespace {
Person personFrom(const drogon::orm::Row& row) {
    return {row["id"].as<std::int64_t>(), row["display_name"].as<std::string>(),
        nullable<std::string>(row["biography"]), row["created_at"].as<std::string>()};
}
}
std::optional<Person> PostgresPersonRepository::findById(std::int64_t id) {
    const auto rows = db_->execSqlSync("SELECT * FROM people WHERE id = $1", id);
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
        "JOIN midi_credits c ON c.midi_id = m.id WHERE c.person_id = $1 ORDER BY m.id, c.role", id))
        midis.push_back({row["id"].as<std::int64_t>(), row["slug"].as<std::string>(),
            row["title"].as<std::string>(), row["role"].as<std::string>()});
    return midis;
}
std::vector<Credit> PostgresPersonRepository::creditsFor(std::int64_t midiId) {
    std::vector<Credit> credits;
    for (const auto& row : db_->execSqlSync(
        "SELECT p.id, p.display_name, c.role FROM people p JOIN midi_credits c ON c.person_id = p.id "
        "WHERE c.midi_id = $1 ORDER BY p.id, c.role", midiId))
        credits.push_back({row["id"].as<std::int64_t>(), row["display_name"].as<std::string>(), row["role"].as<std::string>()});
    return credits;
}
std::vector<Person> PostgresPersonRepository::peopleFor(std::int64_t midiId) {
    std::vector<Person> people;
    for (const auto& row : db_->execSqlSync(
        "SELECT DISTINCT p.* FROM people p JOIN midi_credits c ON c.person_id = p.id "
        "WHERE c.midi_id = $1 ORDER BY p.id", midiId)) people.push_back(personFrom(row));
    return people;
}
}  // namespace lostmidi::person
