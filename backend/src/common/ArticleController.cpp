#include "common/ApiController.h"
#include "common/Transaction.h"
#include <charconv>
#include <algorithm>
#include <cctype>
#include <regex>
#include <set>

namespace lostmidi {
namespace {
std::string articleId(const std::string& value) {
    static const std::regex uuid("^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    if (!std::regex_match(value, uuid)) throw ApiError(400, "INVALID_INPUT", "Invalid article identifier.");
    return value;
}
std::int64_t archiveId(const std::string& value) {
    std::int64_t id = 0;
    const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), id);
    if (error != std::errc{} || end != value.data() + value.size() || id < 1 || std::to_string(id) != value)
        throw ApiError(400, "INVALID_INPUT", "Invalid archive identifier.");
    return id;
}
int pageNumber(const drogon::HttpRequestPtr& request) {
    int page = 1;
    const auto& params = request->getParameters();
    if (const auto it = params.find("page"); it != params.end()) {
        const auto& value = it->second;
        const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), page);
        if (error != std::errc{} || end != value.data() + value.size() || page < 1 || page > 1000000)
            throw ApiError(400, "INVALID_INPUT", "Invalid page.");
    }
    return page;
}
struct ArticleInput {
    std::string title, body, status;
    std::vector<std::int64_t> midis, people;
    std::int64_t revision = 0;
};
std::vector<std::int64_t> idArray(const Json::Value& body, const char* field, bool required) {
    const auto& input = body[field];
    if (!input.isArray() || input.size() > 50 || (required && input.empty()))
        throw ApiError(400, "INVALID_INPUT", "Invalid article associations.");
    std::set<std::int64_t> unique;
    for (const auto& value : input) {
        if (!value.isString()) throw ApiError(400, "INVALID_INPUT", "Association identifiers must be strings.");
        unique.insert(archiveId(value.asString()));
    }
    if (unique.size() != input.size()) throw ApiError(400, "INVALID_INPUT", "Duplicate article association.");
    return {unique.begin(), unique.end()};
}
ArticleInput articleInput(const drogon::HttpRequestPtr& request, bool editing) {
    const auto json = request->getJsonObject();
    if (!json || !json->isObject()) throw ApiError(400, "INVALID_INPUT", "A JSON object is required.");
    const std::set<std::string> allowed{"title", "body_markdown", "status", "midi_ids", "person_ids", "revision"};
    for (const auto& name : json->getMemberNames())
        if (!allowed.contains(name)) throw ApiError(400, "INVALID_INPUT", "Unknown article field.");
    ArticleInput result;
    if (!(*json)["title"].isString() || !(*json)["body_markdown"].isString() || !(*json)["status"].isString())
        throw ApiError(400, "INVALID_INPUT", "Title, Markdown body and status are required.");
    result.title = (*json)["title"].asString(); result.body = (*json)["body_markdown"].asString();
    result.status = (*json)["status"].asString();
    const auto blank = [](const std::string& value) { return std::all_of(value.begin(), value.end(),
        [](unsigned char c) { return std::isspace(c) != 0; }); };
    if (result.title.empty() || blank(result.title) || result.title.size() > 300 ||
        result.body.empty() || blank(result.body) || result.body.size() > 100000 ||
        (result.status != "draft" && result.status != "published"))
        throw ApiError(400, "INVALID_INPUT", "Invalid article title, body or publication status.");
    result.midis = idArray(*json, "midi_ids", true);
    result.people = idArray(*json, "person_ids", false);
    if (editing) {
        if (!(*json)["revision"].isInt64() || (*json)["revision"].asInt64() < 1)
            throw ApiError(400, "INVALID_INPUT", "Article revision is required.");
        result.revision = (*json)["revision"].asInt64();
    }
    return result;
}
Json::Value summary(const drogon::orm::Row& row) {
    Json::Value value;
    value["id"] = row["public_id"].as<std::string>();
    value["title"] = row["title"].as<std::string>();
    value["status"] = row["status"].as<std::string>();
    value["author_username"] = row["author_username"].as<std::string>();
    value["revision"] = Json::Int64(row["revision"].as<std::int64_t>());
    value["created_at"] = row["created_at"].as<std::string>();
    value["updated_at"] = row["updated_at"].as<std::string>();
    return value;
}
Json::Value detail(const drogon::orm::DbClientPtr& db, const std::string& id, bool publicOnly) {
    const auto rows = db->execSqlSync(
        "SELECT * FROM articles a WHERE public_id=$1::uuid AND ($2::boolean=FALSE OR status='published') "
        "AND ($2::boolean=FALSE OR EXISTS(SELECT 1 FROM article_midis am JOIN midi_entries m ON m.id=am.midi_id "
        "WHERE am.article_id=a.public_id AND m.deleted_at IS NULL))", id, publicOnly);
    if (rows.empty()) throw ApiError(404, "ARTICLE_NOT_FOUND", "Article does not exist.");
    auto result = summary(rows[0]);
    result["body_markdown"] = rows[0]["body_markdown"].as<std::string>();
    result["midis"] = Json::Value(Json::arrayValue);
    for (const auto& row : db->execSqlSync(
        "SELECT m.id::text,m.public_id::text,m.slug,m.title,m.archive_status FROM article_midis am JOIN midi_entries m ON m.id=am.midi_id "
        "WHERE am.article_id=$1::uuid AND ($2::boolean=FALSE OR m.deleted_at IS NULL) ORDER BY m.id", id, publicOnly)) {
        Json::Value item; item["id"] = row["id"].as<std::string>();
        item["public_id"] = row["public_id"].as<std::string>(); item["slug"] = row["slug"].as<std::string>(); item["title"] = row["title"].as<std::string>();
        item["archive_status"] = row["archive_status"].as<std::string>();
        result["midis"].append(item);
    }
    result["people"] = Json::Value(Json::arrayValue);
    for (const auto& row : db->execSqlSync(
        "SELECT p.id::text,p.public_id::text,p.display_name FROM article_people ap JOIN people p ON p.id=ap.person_id "
        "WHERE ap.article_id=$1::uuid AND ($2::boolean=FALSE OR p.deleted_at IS NULL) ORDER BY p.id", id, publicOnly)) {
        Json::Value item; item["id"] = row["id"].as<std::string>();
        item["public_id"] = row["public_id"].as<std::string>(); item["display_name"] = row["display_name"].as<std::string>();
        result["people"].append(item);
    }
    return result;
}
void validateAssociations(const std::shared_ptr<drogon::orm::Transaction>& db,
                          const ArticleInput& input, const auth::SessionPrincipal& actor) {
    for (const auto id : input.midis) {
        const auto rows = db->execSqlSync("SELECT archive_status FROM midi_entries WHERE id=$1 AND deleted_at IS NULL FOR SHARE", id);
        if (rows.empty()) throw ApiError(400, "INVALID_ASSOCIATION", "A selected MIDI archive does not exist.");
        if (actor.role != "super_admin" && rows[0]["archive_status"].as<std::string>() == "archived")
            throw ApiError(403, "ARCHIVE_SUPER_ADMIN_REQUIRED", "Only a super administrator may link an archived MIDI.");
    }
    for (const auto id : input.people)
        if (db->execSqlSync("SELECT 1 FROM people WHERE id=$1 AND deleted_at IS NULL FOR SHARE", id).empty())
            throw ApiError(400, "INVALID_ASSOCIATION", "A selected person does not exist.");
}
void rejectArchivedArticleEdit(const std::shared_ptr<drogon::orm::Transaction>& db,
                               const std::string& id, const auth::SessionPrincipal& actor) {
    if (actor.role == "super_admin") return;
    const auto rows = db->execSqlSync(
        "SELECT 1 FROM article_midis am JOIN midi_entries m ON m.id=am.midi_id "
        "WHERE am.article_id=$1::uuid AND m.archive_status='archived' LIMIT 1", id);
    if (!rows.empty()) throw ApiError(403, "ARCHIVE_SUPER_ADMIN_REQUIRED", "Only a super administrator may edit an article linked to an archived MIDI.");
}
}

void ApiController::registerArticleRoutes() {
    drogon::app().registerHandler("/api/v1/articles", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const int page = pageNumber(request);
            int pageSize = 20;
            const auto& params = request->getParameters();
            if (const auto it = params.find("pageSize"); it != params.end()) {
                const auto& value = it->second;
                const auto [end, error] = std::from_chars(value.data(), value.data() + value.size(), pageSize);
                if (error != std::errc{} || end != value.data() + value.size() || pageSize < 1 || pageSize > 100)
                    throw ApiError(400, "INVALID_INPUT", "Invalid page size.");
            }
            Json::Value result; result["data"] = Json::Value(Json::arrayValue);
            result["total"] = Json::Int64(db_->execSqlSync(
                "SELECT count(*) AS total FROM articles a WHERE a.status='published' AND EXISTS("
                "SELECT 1 FROM article_midis am JOIN midi_entries m ON m.id=am.midi_id WHERE am.article_id=a.public_id AND m.deleted_at IS NULL)"
            )[0]["total"].as<std::int64_t>());
            for (const auto& row : db_->execSqlSync(
                "SELECT a.public_id,a.title,a.status,a.author_username,a.revision,a.created_at,a.updated_at FROM articles a WHERE a.status='published' AND EXISTS("
                "SELECT 1 FROM article_midis am JOIN midi_entries m ON m.id=am.midi_id WHERE am.article_id=a.public_id AND m.deleted_at IS NULL) "
                "ORDER BY a.updated_at DESC,a.public_id LIMIT $1 OFFSET $2", pageSize, static_cast<std::int64_t>(page - 1) * pageSize))
                result["data"].append(summary(row));
            result["page"] = page;
            result["pageSize"] = pageSize;
            return result;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/articles/{1}", [this](const drogon::HttpRequestPtr&, Callback&& callback, std::string value) {
        dispatch(std::move(callback), [this, value = std::move(value)] { return detail(db_, articleId(value), true); });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/articles/by-midi/{1}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string value) {
        dispatch(std::move(callback), [this, request, value = std::move(value)] {
            const auto page = pageNumber(request);
            const auto id = articleId(value);
            Json::Value result; result["data"] = Json::Value(Json::arrayValue); result["page"] = page; result["pageSize"] = 10;
            result["total"] = Json::Int64(db_->execSqlSync("SELECT count(*) AS total FROM articles a JOIN article_midis am ON am.article_id=a.public_id JOIN midi_entries m ON m.id=am.midi_id WHERE m.public_id=$1::uuid AND m.deleted_at IS NULL AND a.status='published'", id)[0]["total"].as<std::int64_t>());
            for (const auto& row : db_->execSqlSync(
                "SELECT a.public_id,a.title,a.status,a.author_username,a.revision,a.created_at,a.updated_at FROM articles a JOIN article_midis am ON am.article_id=a.public_id "
                "JOIN midi_entries m ON m.id=am.midi_id WHERE m.public_id=$1::uuid AND m.deleted_at IS NULL "
                "AND a.status='published' ORDER BY a.updated_at DESC,a.public_id LIMIT 10 OFFSET $2", id, static_cast<std::int64_t>(page - 1) * 10))
                result["data"].append(summary(row));
            return result;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/articles/by-person/{1}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string value) {
        dispatch(std::move(callback), [this, request, value = std::move(value)] {
            const auto page = pageNumber(request);
            const auto id = articleId(value);
            Json::Value result; result["data"] = Json::Value(Json::arrayValue); result["page"] = page; result["pageSize"] = 10;
            result["total"] = Json::Int64(db_->execSqlSync("SELECT count(*) AS total FROM articles a JOIN article_people ap ON ap.article_id=a.public_id JOIN people p ON p.id=ap.person_id WHERE p.public_id=$1::uuid AND p.deleted_at IS NULL AND a.status='published' AND EXISTS(SELECT 1 FROM article_midis am JOIN midi_entries m ON m.id=am.midi_id WHERE am.article_id=a.public_id AND m.deleted_at IS NULL)", id)[0]["total"].as<std::int64_t>());
            for (const auto& row : db_->execSqlSync(
                "SELECT a.public_id,a.title,a.status,a.author_username,a.revision,a.created_at,a.updated_at FROM articles a JOIN article_people ap ON ap.article_id=a.public_id "
                "JOIN people p ON p.id=ap.person_id WHERE p.public_id=$1::uuid AND p.deleted_at IS NULL "
                "AND a.status='published' AND EXISTS(SELECT 1 FROM article_midis am JOIN midi_entries m ON m.id=am.midi_id "
                "WHERE am.article_id=a.public_id AND m.deleted_at IS NULL) "
                "ORDER BY a.updated_at DESC,a.public_id LIMIT 10 OFFSET $2", id, static_cast<std::int64_t>(page - 1) * 10))
                result["data"].append(summary(row));
            return result;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/articles", [this](const drogon::HttpRequestPtr& request, Callback&& callback) {
        dispatch(std::move(callback), [this, request] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            if (request->method() == drogon::Get) {
                const int page = pageNumber(request);
                const auto& params = request->getParameters();
                const auto status = params.contains("status") ? params.at("status") : std::string("all");
                const auto q = params.contains("q") ? params.at("q") : std::string{};
                if ((status != "all" && status != "draft" && status != "published") || q.size() > 200 || q.find('\0') != std::string::npos)
                    throw ApiError(400, "INVALID_INPUT", "Invalid article filter.");
                Json::Value result; result["data"] = Json::Value(Json::arrayValue); result["page"] = page; result["pageSize"] = 50;
                result["total"] = Json::Int64(db_->execSqlSync("SELECT count(*) AS total FROM articles WHERE ($1='all' OR status=$1) AND ($2='' OR position(lower($2) in lower(title))>0)", status, q)[0]["total"].as<std::int64_t>());
                for (const auto& row : db_->execSqlSync("SELECT public_id,title,status,author_username,revision,created_at,updated_at FROM articles WHERE ($1='all' OR status=$1) AND ($2='' OR position(lower($2) in lower(title))>0) ORDER BY updated_at DESC,public_id LIMIT 50 OFFSET $3", status, q, static_cast<std::int64_t>(page - 1) * 50))
                    result["data"].append(summary(row));
                return result;
            }
            const auto input = articleInput(request, false);
            TransactionScope tx(db_);
            validateAssociations(tx.db, input, actor);
            const auto rows = tx.db->execSqlSync(
                "INSERT INTO articles(title,body_markdown,status,author_username) VALUES($1,$2,$3,$4) RETURNING public_id::text",
                input.title, input.body, input.status, actor.username);
            const auto id = rows[0]["public_id"].as<std::string>();
            for (const auto midi : input.midis) tx.db->execSqlSync("INSERT INTO article_midis(article_id,midi_id) VALUES($1::uuid,$2)", id, midi);
            for (const auto person : input.people) tx.db->execSqlSync("INSERT INTO article_people(article_id,person_id) VALUES($1::uuid,$2)", id, person);
            tx.commit();
            return detail(db_, id, false);
        }, request->method() == drogon::Post ? 201 : 200);
    }, {drogon::Get, drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/articles/{1}", [this](const drogon::HttpRequestPtr& request, Callback&& callback, std::string value) {
        dispatch(std::move(callback), [this, request, value = std::move(value)] {
            const auto actor = auth_.requirePrincipal(request->getHeader("authorization"));
            const auto id = articleId(value);
            if (request->method() == drogon::Get) return detail(db_, id, false);
            TransactionScope tx(db_);
            const auto current = tx.db->execSqlSync("SELECT revision FROM articles WHERE public_id=$1::uuid FOR UPDATE", id);
            if (current.empty()) throw ApiError(404, "ARTICLE_NOT_FOUND", "Article does not exist.");
            rejectArchivedArticleEdit(tx.db, id, actor);
            if (request->method() == drogon::Delete) {
                tx.db->execSqlSync("DELETE FROM articles WHERE public_id=$1::uuid", id);
                tx.commit(); Json::Value result; result["deleted_id"] = id; return result;
            }
            const auto input = articleInput(request, true);
            if (current[0]["revision"].as<std::int64_t>() != input.revision)
                throw ApiError(409, "STALE_ARTICLE", "Article changed elsewhere. Reload before saving.");
            validateAssociations(tx.db, input, actor);
            tx.db->execSqlSync("UPDATE articles SET title=$2,body_markdown=$3,status=$4 WHERE public_id=$1::uuid", id, input.title, input.body, input.status);
            tx.db->execSqlSync("DELETE FROM article_midis WHERE article_id=$1::uuid", id);
            tx.db->execSqlSync("DELETE FROM article_people WHERE article_id=$1::uuid", id);
            for (const auto midi : input.midis) tx.db->execSqlSync("INSERT INTO article_midis(article_id,midi_id) VALUES($1::uuid,$2)", id, midi);
            for (const auto person : input.people) tx.db->execSqlSync("INSERT INTO article_people(article_id,person_id) VALUES($1::uuid,$2)", id, person);
            tx.commit();
            return detail(db_, id, false);
        });
    }, {drogon::Get, drogon::Put, drogon::Delete});
}
}  // namespace lostmidi
