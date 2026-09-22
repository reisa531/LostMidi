#include "common/ApiController.h"
#include "common/Json.h"
#include "common/Log.h"

namespace lostmidi {
namespace {
std::int64_t positiveId(const std::string& value) {
    std::int64_t id = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), id);
    if (error != std::errc{} || end != value.data() + value.size() || id < 1) throw ApiError(400, "INVALID_INPUT", "A positive id or revision is required.");
    return id;
}
std::string filenameOf(const std::string& encoded) {
    if (encoded.empty() || encoded.size() > 765) throw ApiError(400, "INVALID_FILE", "Invalid filename header.");
    const auto nibble = [](char c) -> int { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; if (c >= 'A' && c <= 'F') return c - 'A' + 10; return -1; };
    std::string result;
    for (std::size_t i = 0; i < encoded.size(); ++i) {
        if (encoded[i] != '%') { result += encoded[i]; continue; }
        if (i + 2 >= encoded.size() || nibble(encoded[i + 1]) < 0 || nibble(encoded[i + 2]) < 0) throw ApiError(400, "INVALID_FILE", "Invalid filename encoding.");
        result += static_cast<char>((nibble(encoded[i + 1]) << 4) | nibble(encoded[i + 2])); i += 2;
    }
    return result;
}
}
void ApiController::registerAdminFileRoutes() {
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/files", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string id) {
        // Bound buffered uploads waiting for workers, independently from metadata requests.
        std::shared_ptr<int> slot;
        if (request->method() == drogon::Post) {
            if (importsPending_.fetch_add(1) >= 2) {
                --importsPending_;
                Json::Value json; json["error"]["code"] = "SERVER_BUSY"; json["error"]["message"] = "Please retry shortly.";
                auto response = drogon::HttpResponse::newHttpJsonResponse(json); response->setStatusCode(drogon::k503ServiceUnavailable); response->addHeader("Cache-Control", "no-store"); callback(response); return;
            }
            slot = std::shared_ptr<int>(new int(0), [this](int* p) { delete p; --importsPending_; });
        }
        dispatch(std::move(callback), [this, request, id = std::move(id), slot] {
            auth_.require(request->getHeader("authorization"));
            const auto midiId = positiveId(id);
            Json::Value json;
            if (request->method() == drogon::Get) {
                const auto editor = importer_.get(midiId);
                json["entry"] = toJson(editor.entry); json["files"] = jsonArray(editor.files);
                json["max_file_size"] = Json::UInt64(midi::maxImportBytes); json["enabled"] = importer_.enabled(); return json;
            }
            if (request->getHeader("content-type") != "application/octet-stream") throw ApiError(415, "INVALID_FILE", "An application/octet-stream body is required.");
            const auto body = request->body();
            const auto result = importer_.import(midiId, positiveId(request->getHeader("x-entry-revision")), filenameOf(request->getHeader("x-file-name")),
                std::as_bytes(std::span(body.data(), body.size())), request->getHeader("x-rights-confirmed") == "true");
            json["file"] = toJson(result.file); json["duplicate"] = result.duplicate; json["revision"] = Json::Int64(result.revision);
            logEvent(result.duplicate ? "midi_file_duplicate" : "midi_file_imported"); return json;
        });
    }, {drogon::Get, drogon::Post});
}
}
