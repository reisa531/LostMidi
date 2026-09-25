#pragma once
#include "catalog/CatalogRepository.h"
#include <map>

namespace lostmidi::catalog {
using QueryParameters = std::map<std::string, std::string>;
PersonQuery parsePeopleQuery(const QueryParameters& parameters);
EntryQuery parseEntryQuery(const QueryParameters& parameters);
GroupQuery parseGroupQuery(const QueryParameters& parameters);

// HTTP query contract: all entry filters intersect. Empty group keys must be
// translated to missing=author or missing=source, never source=none. The latter
// selects a website literally named "none". person=none is also accepted as an
// alias for missing=author. Missing author means no credits of ANY role; missing
// source means no historical_sources rows. Groups contain only represented works.
class CatalogService {
public:
    explicit CatalogService(ICatalogRepository& repository) : repository_(repository) {}
    Overview overview() { return repository_.overview(); }
    PageResult<CatalogEntry> entries(const EntryQuery& query);
    PageResult<Person> people(const PersonQuery& query);
    PageResult<Group> groups(const GroupQuery& query);
private:
    ICatalogRepository& repository_;
};
}  // namespace lostmidi::catalog
