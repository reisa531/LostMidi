#pragma once
#include "catalog/Models.h"

namespace lostmidi::catalog {
class ICatalogRepository {
public:
    virtual ~ICatalogRepository() = default;
    virtual Overview overview() = 0;
    virtual PageResult<CatalogEntry> entries(const EntryQuery& query) = 0;
    virtual PageResult<Person> people(const PersonQuery& query) = 0;
    virtual PageResult<Group> groups(const GroupQuery& query) = 0;
};
}  // namespace lostmidi::catalog
