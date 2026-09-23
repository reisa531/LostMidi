#pragma once
#include "catalog/CatalogRepository.h"
#include <drogon/orm/DbClient.h>
#include <functional>
#include <string_view>

namespace lostmidi::catalog {
class PostgresCatalogRepository final : public ICatalogRepository {
public:
    // Optional diagnostics/test hook; receives SQL templates only, never bindings.
    using QueryObserver = std::function<void(std::string_view)>;
    explicit PostgresCatalogRepository(drogon::orm::DbClientPtr db, QueryObserver observer = {})
        : db_(std::move(db)), observer_(std::move(observer)) {}
    Overview overview() override;
    PageResult<CatalogEntry> entries(const EntryQuery& query) override;
    PageResult<Person> people(Page page) override;
    PageResult<Group> groups(const GroupQuery& query) override;
private:
    drogon::orm::DbClientPtr db_;
    QueryObserver observer_;
};
}  // namespace lostmidi::catalog
