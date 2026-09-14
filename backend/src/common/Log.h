#pragma once
#include <json/json.h>
#include <iostream>
#include <mutex>

namespace lostmidi {
// Deliberately accept event codes, never exception messages, URLs or credentials.
inline void logEvent(const char* event, int status = 0) {
    static std::mutex mutex;
    Json::Value record;
    record["event"] = event;
    if (status) record["status"] = status;
    Json::StreamWriterBuilder writer;
    writer["indentation"] = "";
    std::lock_guard lock(mutex);
    std::clog << Json::writeString(writer, record) << '\n';
}
}  // namespace lostmidi
