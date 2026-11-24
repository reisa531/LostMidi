#include "common/ApiController.h"
#include "common/Error.h"
#include <charconv>
#include <algorithm>
#include <drogon/utils/Utilities.h>
#include <regex>
#include <sstream>

namespace lostmidi {
namespace {
Json::Value parse(const std::string& text) {
    Json::Value value;
    std::istringstream input(text);
    input >> value;
    return value;
}
bool validText(const Json::Value& value, size_t bytes) {
    return value.isString() && !value.asString().empty() && value.asString().size() <= bytes;
}
std::string field(const drogon::orm::Row& row, const char* name) {
    return row[name].as<std::string>();
}
struct Segment { size_t start, length; };
std::optional<size_t> number(std::string_view value) {
    size_t n = 0;
    if (value.empty()) return std::nullopt;
    auto [end, ec] = std::from_chars(value.data(), value.data()+value.size(), n);
    if (ec != std::errc{} || end != value.data()+value.size()) return std::nullopt;
    return n;
}
std::optional<Segment> segment(std::string_view header, size_t size) {
    if (header.empty()) return Segment{0,size};
    if (!header.starts_with("bytes=")) return std::nullopt;
    header.remove_prefix(6);
    const auto dash = header.find('-');
    if (dash == header.npos) return std::nullopt;
    auto left = header.substr(0,dash), right = header.substr(dash+1);
    if (left.empty()) {
        const auto tail = number(right);
        if (!tail || !*tail) return std::nullopt;
        const auto count = std::min(size,*tail);
        return Segment{size-count,count};
    }
    auto first = number(left), last = right.empty() ? std::optional<size_t>(size-1) : number(right);
    if (!first || !last || *first >= size || *last < *first) return std::nullopt;
    // Large ranges are fulfilled in bounded chunks for the serverless transport.
    size_t end = std::min(size-1,*last);
    end = std::min(end,*first+1024*1024-1);
    return Segment{*first,end-*first+1};
}
}
void ApiController::registerArchiveDeskRoutes() {
    drogon::app().registerHandler("/api/v1/front-desk", [this](const drogon::HttpRequestPtr&, Callback&& cb) {
        dispatch(std::move(cb),[this] {
            const auto rows = db_->execSqlSync("SELECT revision,sayings::text,slides::text FROM front_desk WHERE id");
            Json::Value desk;
            desk["revision"] = rows[0]["revision"].as<int>();
            desk["sayings"] = parse(field(rows[0],"sayings"));
            desk["slides"] = parse(field(rows[0],"slides"));
            desk["announcements"] = Json::Value(Json::arrayValue);
            for (const auto& row : db_->execSqlSync("SELECT id::text,title,body,author,published_at::text FROM announcements ORDER BY id DESC LIMIT 10")) {
                Json::Value note;
                for (auto key : {"id","title","body","author","published_at"}) note[key]=field(row,key);
                desk["announcements"].append(note);
            }
            return desk;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/front-desk", [this](const drogon::HttpRequestPtr& req, Callback&& cb) {
        dispatch(std::move(cb),[this,req] {
            auth_.requireStaff(req->getHeader("authorization"));
            const auto body = req->getJsonObject();
            if (!body || !(*body)["revision"].isInt() || !(*body)["sayings"].isArray() ||
                !(*body)["slides"].isArray() || (*body)["slides"].size()>12 || (*body)["sayings"].size()>50)
                throw ApiError(400,"INVALID_INPUT","Invalid front desk settings.");
            for (const auto& saying : (*body)["sayings"])
                if (!validText(saying,600)) throw ApiError(400,"INVALID_INPUT","Invalid saying.");
            static const std::regex path("^/[A-Za-z0-9_/?#=&%.~-]*$");
            for (const auto& slide : (*body)["slides"]) {
                const auto href = slide.get("href","").asString();
                if (!validText(slide["title"],240) || href.size()>500 || href.starts_with("//") ||
                    !std::regex_match(href,path)) throw ApiError(400,"INVALID_INPUT","Use an internal slide link and title.");
            }
            const auto rows = db_->execSqlSync("UPDATE front_desk SET sayings=$1::jsonb,slides=$2::jsonb,revision=revision+1 WHERE id AND revision=$3 RETURNING revision",
                (*body)["sayings"].toStyledString(),(*body)["slides"].toStyledString(),(*body)["revision"].asInt());
            if (rows.empty()) throw ApiError(409,"STALE_SETTINGS","Reload before saving.");
            Json::Value result; result["revision"]=rows[0]["revision"].as<int>(); return result;
        });
    }, {drogon::Put});
    drogon::app().registerHandler("/api/v1/admin/announcements", [this](const drogon::HttpRequestPtr& req, Callback&& cb) {
        dispatch(std::move(cb),[this,req] {
            const auto actor=auth_.requireOwner(req->getHeader("authorization"));
            const auto body=req->getJsonObject();
            if (!body || !validText((*body)["title"],240) || !validText((*body)["body"],6000))
                throw ApiError(400,"INVALID_INPUT","A title and announcement are required.");
            const auto row=db_->execSqlSync("INSERT INTO announcements(title,body,author) VALUES($1,$2,$3) RETURNING id::text",
                (*body)["title"].asString(),(*body)["body"].asString(),actor.username);
            Json::Value result; result["id"]=field(row[0],"id"); return result;
        },201);
    }, {drogon::Post});
    drogon::app().registerHandler("/api/v1/admin/midis/{1}/download-sources", [this](const drogon::HttpRequestPtr& req, Callback&& cb, std::string id) {
        dispatch(std::move(cb), [this, req, id] {
            auth_.requireStaff(req->getHeader("authorization"));
            if (!number(id) || id.size() > 18) throw ApiError(404, "NOT_FOUND", "Unknown record.");
            const auto rows = db_->execSqlSync(
                "SELECT DISTINCT ON (digest) digest, name, media_key, size FROM ("
                "SELECT a.source_hash AS digest,a.filename AS name,'asset/'||a.id AS media_key,octet_length(a.content) AS size,0 AS priority "
                "FROM listening_assets a JOIN midi_entries m ON a.midi_id=m.id WHERE m.id=$1 AND m.deleted_at IS NULL AND a.mime<>'image/webp' "
                "UNION ALL SELECT f.sha256,f.original_filename,'file/'||f.id,f.file_size,1 FROM midi_files f "
                "JOIN midi_entries m ON f.midi_id=m.id WHERE m.id=$1 AND m.deleted_at IS NULL) sources ORDER BY digest,priority,media_key", id);
            Json::Value files(Json::arrayValue);
            for (const auto& row : rows) {
                Json::Value file;
                for (auto column : {"digest","name","media_key"}) file[column] = field(row, column);
                file["size"] = Json::Int64(row["size"].as<int64_t>());
                files.append(file);
            }
            return files;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/player", [this](const drogon::HttpRequestPtr& req, Callback&& cb) {
        dispatch(std::move(cb),[this,req] {
            auth_.requireStaff(req->getHeader("authorization"));
            const auto rows=db_->execSqlSync(
                "SELECT m.id::text,m.title,m.slug, coalesce(a.versions,'[]')::text AS versions, "
                "c.id::text AS cover,c.provenance FROM midi_entries m "
                "LEFT JOIN LATERAL (SELECT json_agg(json_build_object('key',v.key,'name',v.name,'mime',v.mime) ORDER BY v.name) versions FROM ("
                "SELECT 'asset/'||id AS key,filename AS name,mime FROM listening_assets WHERE midi_id=m.id AND mime<>'image/webp' UNION ALL "
                "SELECT 'file/'||id,original_filename,listening_mime(original_filename) FROM midi_files f WHERE f.midi_id=m.id AND listening_mime(original_filename) IS NOT NULL AND NOT EXISTS "
                "(SELECT 1 FROM listening_assets a WHERE a.midi_id=m.id AND a.source_hash=f.sha256)) v) a ON true "
                "LEFT JOIN LATERAL (SELECT id,provenance FROM listening_assets WHERE midi_id=m.id AND mime='image/webp' ORDER BY id LIMIT 1) c ON true "
                "WHERE m.deleted_at IS NULL ORDER BY m.title,m.id");
            Json::Value library(Json::arrayValue);
            for (const auto& row:rows) {
                Json::Value song; for (auto key:{"id","title","slug"}) song[key]=field(row,key);
                song["versions"]=parse(field(row,"versions"));
                if (!row["cover"].isNull()) { song["cover"]="asset/"+field(row,"cover"); song["game"]=field(row,"provenance"); }
                library.append(song);
            }
            return library;
        });
    }, {drogon::Get});
    drogon::app().registerHandler("/api/v1/admin/player/{1}/{2}", [this](const drogon::HttpRequestPtr& req, Callback&& cb,std::string kind,std::string id) {
        dispatchResponse(std::move(cb),[this,req,kind,id] {
            auth_.requireStaff(req->getHeader("authorization"));
            const bool asset=kind=="asset";
            if ((!asset && kind!="file") || !number(id) || id.size()>18) throw ApiError(404,"NOT_FOUND","Unknown media.");
            const auto rows=db_->execSqlSync(asset ?
                "SELECT octet_length(a.content)::bigint AS size,mime FROM listening_assets a JOIN midi_entries m ON m.id=a.midi_id WHERE a.id=$1 AND m.deleted_at IS NULL" :
                "SELECT f.file_size AS size,coalesce(listening_mime(f.original_filename),'application/octet-stream') AS mime,f.storage_key,p.file_id FROM midi_files f JOIN midi_entries m ON m.id=f.midi_id LEFT JOIN midi_private_files p ON p.file_id=f.id WHERE f.id=$1 AND m.deleted_at IS NULL", id);
            if (rows.empty()) throw ApiError(404,"NOT_FOUND","Media not found.");
            const auto size=static_cast<size_t>(rows[0]["size"].as<int64_t>());
            const auto range=req->getHeader("range");
            auto part=segment(range,size);
            auto response=drogon::HttpResponse::newHttpResponse();
            response->addHeader("Cache-Control","private, no-store");
            response->addHeader("Accept-Ranges","bytes");
            if (!part) {
                response->setStatusCode(static_cast<drogon::HttpStatusCode>(416));
                response->addHeader("Content-Range","bytes */"+std::to_string(size)); return response;
            }
            std::string payload;
            if (asset || !rows[0]["file_id"].isNull()) {
                const auto data=db_->execSqlSync(asset ?
                    "SELECT encode(substring(content FROM $2::int FOR $3::int),'base64') AS data FROM listening_assets WHERE id=$1" :
                    "SELECT encode(substring(content FROM $2::int FOR $3::int),'base64') AS data FROM midi_private_files WHERE file_id=$1",
                    id,static_cast<int>(part->start+1),static_cast<int>(part->length));
                if (data.empty()) throw ApiError(404,"NOT_FOUND","Media not found.");
                auto encoded=field(data[0],"data");
                encoded.erase(std::remove(encoded.begin(),encoded.end(),'\n'),encoded.end());
                payload=drogon::utils::base64Decode(encoded);
            } else payload=objects_.read(field(rows[0],"storage_key"),size).substr(part->start,part->length);
            if (payload.size()!=part->length) throw ApiError(503,"STORAGE_UNAVAILABLE","Media could not be read.");
            if (!range.empty()) {
                response->setStatusCode(drogon::k206PartialContent);
                response->addHeader("Content-Range","bytes "+std::to_string(part->start)+"-"+std::to_string(part->start+part->length-1)+"/"+std::to_string(size));
            }
            response->setContentTypeString(field(rows[0],"mime"));
            response->setBody(std::move(payload)); return response;
        });
    }, {drogon::Get});
}
}
