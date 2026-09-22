#pragma once
#include <json/json.h>
#include "midi/Models.h"
#include "person/PersonWriteService.h"
#include "recovery/RecoveryWriteService.h"

namespace lostmidi {
template <typename T>
Json::Value jsonOptional(const std::optional<T>& value) {
    return value ? Json::Value(*value) : Json::Value(Json::nullValue);
}
inline Json::Value toJson(const person::Person& p) {
    Json::Value j;
    j["id"] = std::to_string(p.id);
    j["display_name"] = p.displayName;
    j["biography"] = jsonOptional(p.biography);
    j["created_at"] = p.createdAt;
    j["revision"] = Json::Int64(p.revision);
    return j;
}
inline Json::Value toJson(const person::Credit& c) {
    Json::Value j;
    j["person_id"] = std::to_string(c.personId);
    j["display_name"] = c.displayName;
    j["role"] = c.role;
    return j;
}
inline Json::Value toJson(const midi::MidiEntry& e) {
    Json::Value j;
    j["id"] = std::to_string(e.id);
    j["slug"] = e.slug;
    j["title"] = e.title;
    j["description"] = jsonOptional(e.description);
    j["estimated_year"] = jsonOptional(e.estimatedYear);
    j["archive_status"] = e.archiveStatus;
    j["created_at"] = e.createdAt;
    j["updated_at"] = e.updatedAt;
    j["copyright_status"] = jsonOptional(e.copyrightStatus);
    j["license"] = jsonOptional(e.license);
    j["rights_holder"] = jsonOptional(e.rightsHolder);
    j["distribution_permission"] = jsonOptional(e.distributionPermission);
    j["revision"] = Json::Int64(e.revision);
    return j;
}
inline Json::Value toJson(const midi::MidiFile& f) {
    Json::Value j;
    j["id"] = std::to_string(f.id);
    j["original_filename"] = f.originalFilename;
    j["sha256"] = f.sha256;
    j["file_size"] = Json::UInt64(f.fileSize);
    j["discovered_at"] = jsonOptional(f.discoveredAt);
    j["created_at"] = f.createdAt;
    return j;
}
inline Json::Value toJson(const recovery::HistoricalSource& s) {
    Json::Value j;
    j["id"] = std::to_string(s.id);
    j["website_name"] = s.websiteName;
    j["original_url"] = jsonOptional(s.originalUrl);
    j["first_seen_at"] = jsonOptional(s.firstSeenAt);
    j["last_seen_at"] = jsonOptional(s.lastSeenAt);
    j["wayback_url"] = jsonOptional(s.waybackUrl);
    j["notes"] = jsonOptional(s.notes);
    return j;
}
inline Json::Value toJson(const recovery::RecoveryEvent& e) {
    Json::Value j;
    j["id"] = std::to_string(e.id);
    j["recovered_at"] = jsonOptional(e.recoveredAt);
    j["recovered_by"] = e.recoveredBy ? Json::Value(std::to_string(*e.recoveredBy)) : Json::Value(Json::nullValue);
    j["recovered_by_name"] = jsonOptional(e.recoveredByName);
    j["story"] = e.story;
    j["evidence"] = jsonOptional(e.evidence);
    j["created_at"] = e.createdAt;
    return j;
}
template <typename T>
Json::Value jsonArray(const std::vector<T>& values) {
    Json::Value j(Json::arrayValue);
    for (const auto& value : values) j.append(toJson(value));
    return j;
}
inline Json::Value toJson(const recovery::HistoryEditor& editor) {
    Json::Value j;
    j["entry"]["id"] = std::to_string(editor.midiId);
    j["entry"]["title"] = editor.title;
    j["entry"]["slug"] = editor.slug;
    j["entry"]["revision"] = Json::Int64(editor.revision);
    j["historical_sources"] = jsonArray(editor.history.sources);
    j["recovery_events"] = jsonArray(editor.history.events);
    return j;
}
inline Json::Value toJson(const recovery::SourceWriteResult& result) {
    Json::Value j;
    j["revision"] = Json::Int64(result.revision);
    j["source"] = toJson(result.source);
    return j;
}
inline Json::Value toJson(const recovery::EventWriteResult& result) {
    Json::Value j;
    j["revision"] = Json::Int64(result.revision);
    j["event"] = toJson(result.event);
    return j;
}
inline Json::Value toJson(const recovery::DeleteResult& result) {
    Json::Value j;
    j["revision"] = Json::Int64(result.revision);
    j["deleted_id"] = std::to_string(result.deletedId);
    return j;
}
inline Json::Value toJson(const midi::MidiDetail& d) {
    Json::Value j;
    j["entry"] = toJson(d.entry);
    j["credits"] = jsonArray(d.credits);
    j["people"] = jsonArray(d.people);
    j["historical_sources"] = jsonArray(d.history.sources);
    j["recovery_events"] = jsonArray(d.history.events);
    j["files"] = jsonArray(d.files);
    return j;
}
inline Json::Value toJson(const person::PersonDetail& d) {
    Json::Value j;
    j["person"] = toJson(d.person);
    j["aliases"] = Json::Value(Json::arrayValue);
    for (const auto& alias : d.aliases) j["aliases"].append(alias);
    j["midis"] = Json::Value(Json::arrayValue);
    for (const auto& m : d.midis) {
        Json::Value item;
        item["id"] = std::to_string(m.id);
        item["slug"] = m.slug;
        item["title"] = m.title;
        item["role"] = m.role;
        j["midis"].append(item);
    }
    return j;
}
inline Json::Value toJson(const person::PersonEdit& edit) {
    Json::Value j;
    j["person"] = toJson(edit.person);
    j["aliases"] = Json::Value(Json::arrayValue);
    for (const auto& alias : edit.aliases) j["aliases"].append(alias);
    return j;
}
inline Json::Value toJson(const person::CreditEdit& edit) {
    Json::Value j;
    j["revision"] = Json::Int64(edit.revision);
    j["credits"] = jsonArray(edit.credits);
    return j;
}
}  // namespace lostmidi
