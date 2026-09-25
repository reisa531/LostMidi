#pragma once
#include "common/Pagination.h"
#include <optional>
#include <string>
#include <vector>

namespace lostmidi::catalog {
struct Credit {
    std::int64_t personId = 0;
    std::string displayName;
    std::string role;
};
// Deliberately independent of MIDI detail models: no keys, rights or consent fields.
struct CatalogEntry {
    std::int64_t id = 0;
    std::string slug;
    std::string title;
    std::optional<int> estimatedYear;
    std::string archiveStatus;
    std::string updatedAt;
    std::vector<Credit> credits;
    std::vector<std::string> sources;
    std::int64_t fileCount = 0;
    std::int64_t downloadableFileCount = 0;
    std::string publicId;
    std::optional<std::string> estimatedDate;
    std::optional<std::string> summary;
};
struct Person {
    std::int64_t id = 0;
    std::string displayName;
    std::optional<std::string> biography;
    std::optional<std::string> summary;
    std::string updatedAt;
    std::vector<std::string> aliases;
    std::int64_t midiCount = 0;
    std::string publicId;
};
struct Group {
    std::string key;
    std::string label;
    std::int64_t entries = 0;
    std::int64_t withFiles = 0;
    std::int64_t downloadable = 0;
};
struct Stats {
    std::int64_t entries = 0, people = 0, files = 0, withFiles = 0, downloadable = 0, sources = 0;
    std::int64_t archived = 0, partiallyRecovered = 0, lost = 0, uncertain = 0;
};
struct Overview {
    Stats stats;
    std::vector<CatalogEntry> recent;
    std::vector<CatalogEntry> needsAttention;
};
template<class T> struct PageResult {
    std::vector<T> data;
    Page page;
    std::int64_t total = 0;
};
struct EntryQuery {
    Page page;
    std::string search;
    std::optional<std::string> status;
    std::optional<std::int64_t> personId;
    std::optional<std::string> source;
    std::string sort = "updated";
    bool missingAuthor = false;
    bool missingSource = false;
};
struct PersonQuery { Page page; std::string search; };
struct GroupQuery {
    Page page{1, 30};
    std::string by = "author";
};
}  // namespace lostmidi::catalog
