#pragma once
#include "catalog/Models.h"
#include <json/json.h>

namespace lostmidi::catalog {
inline Json::Value toJson(const CatalogEntry& entry) {
    Json::Value json;
    json["id"] = std::to_string(entry.id);
    json["public_id"] = entry.publicId;
    json["slug"] = entry.slug;
    json["title"] = entry.title;
    json["estimated_year"] = entry.estimatedYear ? Json::Value(*entry.estimatedYear) : Json::Value(Json::nullValue);
    json["archive_status"] = entry.archiveStatus;
    json["updated_at"] = entry.updatedAt;
    json["credits"] = Json::Value(Json::arrayValue);
    for (const auto& credit : entry.credits) {
        Json::Value item;
        item["person_id"] = std::to_string(credit.personId);
        item["display_name"] = credit.displayName;
        item["role"] = credit.role;
        json["credits"].append(item);
    }
    json["sources"] = Json::Value(Json::arrayValue);
    for (const auto& source : entry.sources) json["sources"].append(source);
    json["file_count"] = Json::Int64(entry.fileCount);
    json["downloadable_file_count"] = Json::Int64(entry.downloadableFileCount);
    return json;
}
inline Json::Value toJson(const Person& person) {
    Json::Value json;
    json["id"] = std::to_string(person.id);
    json["public_id"] = person.publicId;
    json["display_name"] = person.displayName;
    json["biography"] = person.biography ? Json::Value(*person.biography) : Json::Value(Json::nullValue);
    json["aliases"] = Json::Value(Json::arrayValue);
    for (const auto& alias : person.aliases) json["aliases"].append(alias);
    json["midi_count"] = Json::Int64(person.midiCount);
    return json;
}
inline Json::Value toJson(const Group& group) {
    Json::Value json;
    json["key"] = group.key;
    json["label"] = group.label;
    json["entries"] = Json::Int64(group.entries);
    json["with_files"] = Json::Int64(group.withFiles);
    json["downloadable"] = Json::Int64(group.downloadable);
    return json;
}
template<class T> Json::Value toJson(const PageResult<T>& page) {
    Json::Value json;
    json["data"] = Json::Value(Json::arrayValue);
    for (const auto& item : page.data) json["data"].append(toJson(item));
    json["pagination"]["page"] = page.page.number;
    json["pagination"]["pageSize"] = page.page.size;
    json["pagination"]["total"] = Json::Int64(page.total);
    return json;
}
inline Json::Value toJson(const Overview& overview) {
    Json::Value json;
    auto& stats = json["stats"];
    stats["entries"] = Json::Int64(overview.stats.entries);
    stats["people"] = Json::Int64(overview.stats.people);
    stats["files"] = Json::Int64(overview.stats.files);
    stats["with_files"] = Json::Int64(overview.stats.withFiles);
    stats["downloadable"] = Json::Int64(overview.stats.downloadable);
    stats["sources"] = Json::Int64(overview.stats.sources);
    stats["statuses"]["archived"] = Json::Int64(overview.stats.archived);
    stats["statuses"]["partially_recovered"] = Json::Int64(overview.stats.partiallyRecovered);
    stats["statuses"]["lost"] = Json::Int64(overview.stats.lost);
    stats["statuses"]["uncertain"] = Json::Int64(overview.stats.uncertain);
    json["recent"] = Json::Value(Json::arrayValue);
    for (const auto& entry : overview.recent) json["recent"].append(toJson(entry));
    json["needs_attention"] = Json::Value(Json::arrayValue);
    for (const auto& entry : overview.needsAttention) json["needs_attention"].append(toJson(entry));
    return json;
}
}  // namespace lostmidi::catalog
