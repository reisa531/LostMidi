#pragma once
#include <json/json.h>
#include <iostream>
#include <mutex>
#include <string_view>

namespace lostmidi {
// Deliberately accept event codes, never exception messages, URLs or credentials.
inline void logEvent(const char* event, int status = 0, std::string_view sqlState = {}) {
    static std::mutex mutex;
    Json::Value record;
    record["event"] = event;
    if (status) record["status"] = status;
    // SQLSTATE is a fixed five-character database code; never log SQL or its parameters.
    if (sqlState.size() == 5) {
        bool valid = true;
        for (const char c : sqlState)
            valid = valid && ((c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z'));
        if (valid) record["sqlstate"] = std::string(sqlState);
    }
    Json::StreamWriterBuilder writer;
    writer["indentation"] = "";
    std::lock_guard lock(mutex);
    std::clog << Json::writeString(writer, record) << '\n';
}
}  // namespace lostmidi
