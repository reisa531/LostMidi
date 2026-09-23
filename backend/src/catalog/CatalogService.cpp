#include "catalog/CatalogService.h"

namespace lostmidi::catalog {
namespace {
[[noreturn]] void invalid(const char* message) {
    throw ApiError(400, "INVALID_INPUT", message);
}
bool validStatus(const std::string& status) {
    return status == "archived" || status == "partially_recovered" || status == "lost" || status == "uncertain";
}
bool validUtf8(const std::string& text) {
    for (std::size_t i = 0; i < text.size();) {
        const auto lead = static_cast<unsigned char>(text[i++]);
        if (lead < 0x80) { if (lead == 0) return false; continue; }
        unsigned remaining = 0, codepoint = 0, minimum = 0;
        if (lead >= 0xc2 && lead <= 0xdf) { remaining = 1; codepoint = lead & 0x1f; minimum = 0x80; }
        else if (lead >= 0xe0 && lead <= 0xef) { remaining = 2; codepoint = lead & 0x0f; minimum = 0x800; }
        else if (lead >= 0xf0 && lead <= 0xf4) { remaining = 3; codepoint = lead & 0x07; minimum = 0x10000; }
        else return false;
        if (i + remaining > text.size()) return false;
        while (remaining--) {
            const auto next = static_cast<unsigned char>(text[i++]);
            if ((next & 0xc0) != 0x80) return false;
            codepoint = (codepoint << 6) | (next & 0x3f);
        }
        if (codepoint < minimum || codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff)) return false;
    }
    return true;
}
void validate(const EntryQuery& query) {
    query.page.validate();
    if (query.status && !validStatus(*query.status)) invalid("Invalid catalog status.");
    if (query.personId && *query.personId < 1) invalid("person must be a positive 64-bit integer or none.");
    if (query.source && (query.source->empty() || query.source->size() > 500 || !validUtf8(*query.source)))
        invalid("source must be nonempty UTF-8, at most 500 bytes, with no NUL.");
    if (query.sort != "updated" && query.sort != "title") invalid("sort must be updated or title.");
}
void validate(const GroupQuery& query) {
    query.page.validate();
    if (query.by != "author" && query.by != "source") invalid("by must be author or source.");
}
Page parsePage(const QueryParameters& parameters, int defaultSize) {
    Page page{1, defaultSize};
    if (const auto it = parameters.find("page"); it != parameters.end())
        page.number = positiveInteger(it->second, 1000000, "page");
    if (const auto it = parameters.find("pageSize"); it != parameters.end())
        page.size = positiveInteger(it->second, 100, "pageSize");
    return page;
}
}
Page parsePeoplePage(const QueryParameters& parameters) { return parsePage(parameters, 20); }
EntryQuery parseEntryQuery(const QueryParameters& parameters) {
    EntryQuery query;
    query.page = parsePage(parameters, 20);
    if (const auto it = parameters.find("status"); it != parameters.end()) query.status = it->second;
    if (const auto it = parameters.find("source"); it != parameters.end()) query.source = it->second;
    if (const auto it = parameters.find("sort"); it != parameters.end()) query.sort = it->second;
    if (const auto it = parameters.find("person"); it != parameters.end()) {
        if (it->second == "none") query.missingAuthor = true;
        else {
            std::int64_t id = 0;
            const auto& value = it->second;
            const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), id);
            if (value.empty() || error != std::errc{} || end != value.data() + value.size() || id < 1)
                invalid("person must be a positive 64-bit integer or none.");
            query.personId = id;
        }
    }
    if (const auto it = parameters.find("missing"); it != parameters.end()) {
        if (it->second == "author") query.missingAuthor = true;
        else if (it->second == "source") query.missingSource = true;
        else invalid("missing must be author or source.");
    }
    validate(query);
    return query;
}
GroupQuery parseGroupQuery(const QueryParameters& parameters) {
    GroupQuery query;
    query.page = parsePage(parameters, 30);
    if (const auto it = parameters.find("by"); it != parameters.end()) query.by = it->second;
    validate(query);
    return query;
}
PageResult<CatalogEntry> CatalogService::entries(const EntryQuery& query) {
    validate(query);
    return repository_.entries(query);
}
PageResult<Person> CatalogService::people(Page page) {
    page.validate();
    return repository_.people(page);
}
PageResult<Group> CatalogService::groups(const GroupQuery& query) {
    validate(query);
    return repository_.groups(query);
}
}  // namespace lostmidi::catalog
