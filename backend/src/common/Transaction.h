#pragma once
#include "common/Database.h"
#include <future>
#include <chrono>

namespace lostmidi {
// Workers use synchronous SQL; acknowledge COMMIT before returning a successful write.
class TransactionScope {
public:
    explicit TransactionScope(const drogon::orm::DbClientPtr& client) : db(client->newTransaction()) {}
    ~TransactionScope() { if (db) db->rollback(); }
    void commit() {
        auto result = std::make_shared<std::promise<bool>>();
        auto future = result->get_future();
        db->setCommitCallback([result](bool committed) { result->set_value(committed); });
        db.reset();
        if (future.wait_for(std::chrono::seconds(10)) != std::future_status::ready || !future.get())
            throw drogon::orm::Failure("Transaction commit could not be confirmed.");
    }
    std::shared_ptr<drogon::orm::Transaction> db;
};
}
