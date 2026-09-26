#pragma once
#include <json/json.h>
#include <sstream>
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
    j["public_id"] = p.publicId;
    j["display_name"] = p.displayName;
    j["biography"] = jsonOptional(p.biography);
    j["summary"] = jsonOptional(p.summary);
    Json::CharReaderBuilder reader;
    Json::Value profile;
    std::string errors;
    std::istringstream input(p.profile);
    if (Json::parseFromStream(reader, input, &profile, &errors)) j["profile"] = profile;
    j["created_at"] = p.createdAt;
    j["updated_at"] = p.updatedAt;
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
    j["public_id"] = e.publicId;
    j["slug"] = e.slug;
    j["title"] = e.title;
    j["description"] = jsonOptional(e.description);
    j["estimated_year"] = jsonOptional(e.estimatedYear);
    j["estimated_date"] = jsonOptional(e.estimatedDate);
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
template <typename T>
Json::Value jsonArray(const std::vector<T>& values);
inline Json::Value toJson(const recovery::HistoricalSource& s) {
    Json::Value j;
    j["id"] = std::to_string(s.id);
    j["website_name"] = s.websiteName;
    j["original_url"] = jsonOptional(s.originalUrl);
    j["first_seen_at"] = jsonOptional(s.firstSeenAt);
    j["last_seen_at"] = jsonOptional(s.lastSeenAt);
    j["wayback_url"] = jsonOptional(s.waybackUrl);
    j["notes"] = jsonOptional(s.notes);
    j["source_type"] = s.sourceType;
    j["credibility"] = s.credibility;
    j["checked_at"] = jsonOptional(s.checkedAt);
    return j;
}
inline Json::Value toJson(const recovery::RecoveryEvent& e) {
    Json::Value j;
    j["id"] = std::to_string(e.id);
    j["recovered_at"] = jsonOptional(e.recoveredAt);
    j["recovered_by"] = Json::Value(Json::nullValue);
    j["recovered_by_name"] = jsonOptional(e.recoveredByName);
    j["story"] = e.story;
    j["evidence"] = jsonOptional(e.evidence);
    j["created_at"] = e.createdAt;
    return j;
}
inline Json::Value toJson(const recovery::EvidenceFile& f) {
    Json::Value j;
    j["id"] = std::to_string(f.id);
    j["filename"] = f.filename;
    j["media_type"] = f.mediaType;
    j["sha256"] = f.sha256;
    j["file_size"] = f.fileSize;
    j["created_at"] = f.createdAt;
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
    j["historical_sources"] = Json::Value(Json::arrayValue);
    for (const auto& source : editor.history.sources) {
        auto item = toJson(source); item["evidence_files"] = jsonArray(source.evidenceFiles);
        j["historical_sources"].append(item);
    }
    j["recovery_events"] = Json::Value(Json::arrayValue);
    for (const auto& event : editor.history.events) {
        auto item = toJson(event); item["evidence_files"] = jsonArray(event.evidenceFiles);
        j["recovery_events"].append(item);
    }
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
    j["historical_sources"] = Json::Value(Json::arrayValue);
    for (const auto& source : d.history.sources) {
        auto item = toJson(source); item["evidence_files"] = jsonArray(source.evidenceFiles);
        j["historical_sources"].append(item);
    }
    j["recovery_events"] = Json::Value(Json::arrayValue);
    for (const auto& event : d.history.events) {
        auto item = toJson(event); item["evidence_files"] = jsonArray(event.evidenceFiles);
        j["recovery_events"].append(item);
    }
    j["files"] = Json::Value(Json::arrayValue);
    for (const auto& file : d.files) {
        auto item = toJson(file);
        item["download_available"] = midi::downloadAllowed(d.entry, file);
        j["files"].append(item);
    }
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
        item["public_id"] = m.publicId;
        item["slug"] = m.slug;
        item["title"] = m.title;
        item["role"] = m.role;
        j["midis"].append(item);
    }
    j["previous"] = d.previous ? toJson(*d.previous) : Json::Value(Json::nullValue);
    j["next"] = d.next ? toJson(*d.next) : Json::Value(Json::nullValue);
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
