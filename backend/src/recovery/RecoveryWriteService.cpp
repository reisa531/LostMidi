#include "recovery/RecoveryWriteService.h"
#include "common/Error.h"
#include <algorithm>
#include <charconv>
#include <chrono>
#include <string_view>

namespace lostmidi::recovery {
namespace {
[[noreturn]] void invalid(const char* message) { throw ApiError(400, "INVALID_INPUT", message); }
void positive(std::int64_t value) {
    if (value < 1) invalid("Ids and revision must be positive integers.");
}
void writeIds(std::int64_t midiId, std::int64_t childId, std::int64_t revision) {
    positive(midiId);
    positive(revision);
    if (childId < 0) invalid("Invalid record id.");
}
void noNul(std::string_view value) {
    if (value.find('\0') != std::string_view::npos) invalid("Text must not contain null characters.");
}
void requiredText(std::string& value, std::size_t maximum) {
    noNul(value);
    constexpr auto whitespace = " \t\r\n\f\v";
    const auto first = value.find_first_not_of(whitespace);
    if (first == std::string::npos) invalid("Required text must not be blank.");
    value = value.substr(first, value.find_last_not_of(whitespace) - first + 1);
    if (value.size() > maximum) invalid("Text exceeds the UTF-8 byte limit.");
}
void optionalText(std::optional<std::string>& value, std::size_t maximum) {
    if (!value) return;
    noNul(*value);
    if (value->size() > maximum) invalid("Text exceeds the UTF-8 byte limit.");
    if (value->empty()) value.reset();
}
bool digit(char c) { return c >= '0' && c <= '9'; }
bool hex(char c) { return digit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'); }
bool alpha(char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'); }

// RFC 3986 components, not an IRI: non-ASCII octets must be percent encoded.
// Validate escapes rather than accepting arbitrary text after a scheme prefix.
bool uriComponent(std::string_view value, std::string_view extra) {
    for (std::size_t i = 0; i < value.size(); ++i) {
        const auto c = value[i];
        if (alpha(c) || digit(c) || std::string_view("-._~!$&'()*+,;=").find(c) != std::string_view::npos ||
            extra.find(c) != std::string_view::npos) continue;
        if (c != '%' || i + 2 >= value.size() || !hex(value[i + 1]) || !hex(value[i + 2])) return false;
        i += 2;
    }
    return true;
}
bool registeredHost(std::string_view host) {
    if (host.empty() || !uriComponent(host, "")) return false;
    // Encoded authority delimiters/controls are not host characters either.
    const auto hexValue = [](char c) {
        return digit(c) ? c - '0' : (c >= 'a' && c <= 'f' ? c - 'a' + 10 : c - 'A' + 10);
    };
    for (std::size_t i = 0; i < host.size(); ++i) {
        if (host[i] != '%') continue;
        const auto decoded = static_cast<unsigned char>(hexValue(host[i + 1]) * 16 + hexValue(host[i + 2]));
        if (decoded < 0x80 && (decoded == '%' || !uriComponent(std::string(1, static_cast<char>(decoded)), ""))) return false;
        i += 2;
    }
    return true;
}
bool ipv4(std::string_view value) {
    int parts = 0;
    while (!value.empty()) {
        const auto dot = value.find('.');
        const auto part = value.substr(0, dot);
        if (part.empty() || part.size() > 3 || !std::all_of(part.begin(), part.end(), digit) ||
            (part.size() > 1 && part.front() == '0')) return false;
        int number = 0;
        std::from_chars(part.data(), part.data() + part.size(), number);
        if (number > 255) return false;
        ++parts;
        if (dot == std::string_view::npos) return parts == 4;
        value.remove_prefix(dot + 1);
    }
    return false;
}
bool ipv6(std::string_view address) {
    const auto compression = address.find("::");
    if (compression != std::string_view::npos && address.find("::", compression + 2) != std::string_view::npos) return false;
    int groups = 0;
    const auto groupList = [&](std::string_view part, bool isEnd) {
        if (part.empty()) return true;
        while (!part.empty()) {
            const auto colon = part.find(':');
            const auto group = part.substr(0, colon);
            if (group.find('.') != std::string_view::npos) {
                if (!isEnd || colon != std::string_view::npos || !ipv4(group)) return false;
                groups += 2;
            } else {
                if (group.empty() || group.size() > 4 || !std::all_of(group.begin(), group.end(), hex)) return false;
                ++groups;
            }
            if (colon == std::string_view::npos) return true;
            part.remove_prefix(colon + 1);
            if (part.empty()) return false;
        }
        return true;
    };
    if (compression == std::string_view::npos) return groupList(address, true) && groups == 8;
    return groupList(address.substr(0, compression), false) &&
        groupList(address.substr(compression + 2), true) && groups < 8;
}
void url(std::optional<std::string>& value) {
    optionalText(value, 4096);
    if (!value) return;
    const std::string_view input(*value);
    for (const unsigned char c : input)
        if (c <= 0x20 || c >= 0x7f || c == '\\') invalid("URL must not contain whitespace, controls or backslashes.");
    const auto separator = input.find("://");
    if (separator == std::string_view::npos) invalid("An absolute HTTP or HTTPS URL is required.");
    auto scheme = std::string(input.substr(0, separator));
    for (auto& c : scheme) if (c >= 'A' && c <= 'Z') c = static_cast<char>(c - 'A' + 'a');
    if (scheme != "http" && scheme != "https") invalid("An absolute HTTP or HTTPS URL is required.");
    const auto remainder = input.substr(separator + 3);
    const auto authorityEnd = remainder.find_first_of("/?#");
    const auto authority = remainder.substr(0, authorityEnd);
    if (authority.empty() || authority.find('@') != std::string_view::npos) invalid("URL requires a host without userinfo.");
    std::string_view host;
    std::string_view port;
    bool hasPort = false;
    if (authority.front() == '[') {
        const auto close = authority.find(']');
        if (close == std::string_view::npos || !ipv6(authority.substr(1, close - 1))) invalid("Invalid IPv6 URL host.");
        if (close + 1 < authority.size()) {
            if (authority[close + 1] != ':') invalid("Invalid URL authority.");
            hasPort = true;
            port = authority.substr(close + 2);
        }
    } else {
        const auto colon = authority.find(':');
        host = authority.substr(0, colon);
        if (!registeredHost(host)) invalid("Invalid URL host.");
        if (colon != std::string_view::npos) {
            hasPort = true;
            port = authority.substr(colon + 1);
        }
    }
    if (hasPort) {
        unsigned number = 0;
        const auto [end, error] = std::from_chars(port.data(), port.data() + port.size(), number);
        if (port.empty() || !std::all_of(port.begin(), port.end(), digit) || error != std::errc{} ||
            end != port.data() + port.size() || number > 65535) invalid("Invalid URL port.");
    }
    if (authorityEnd == std::string_view::npos) return;
    auto pathAndQuery = remainder.substr(authorityEnd);
    const auto hash = pathAndQuery.find('#');
    if (hash != std::string_view::npos) {
        if (!uriComponent(pathAndQuery.substr(hash + 1), ":@/?")) invalid("Invalid URL fragment.");
        pathAndQuery = pathAndQuery.substr(0, hash);
    }
    const auto query = pathAndQuery.find('?');
    if (query != std::string_view::npos) {
        if (!uriComponent(pathAndQuery.substr(query + 1), ":@/?")) invalid("Invalid URL query.");
        pathAndQuery = pathAndQuery.substr(0, query);
    }
    if (!uriComponent(pathAndQuery, ":@/")) invalid("Invalid URL path.");
}
void utcTimestamp(std::optional<std::string>& value) {
    if (!value) return;
    noNul(*value);
    const std::string_view input(*value);
    if (input.size() < 20 || input.size() > 27 || input[4] != '-' || input[7] != '-' ||
        input[10] != 'T' || input[13] != ':' || input[16] != ':' || input.back() != 'Z')
        invalid("Time must be a complete UTC RFC3339 timestamp or null.");
    const auto number = [&](std::size_t offset, std::size_t length) {
        int result = 0;
        for (const auto c : input.substr(offset, length)) {
            if (!digit(c)) invalid("Invalid timestamp digits.");
            result = result * 10 + (c - '0');
        }
        return result;
    };
    const int year = number(0, 4);
    const auto month = static_cast<unsigned>(number(5, 2));
    const auto day = static_cast<unsigned>(number(8, 2));
    const auto date = std::chrono::year_month_day(std::chrono::year(year), std::chrono::month(month), std::chrono::day(day));
    if (year < 1 || !date.ok() || number(11, 2) > 23 || number(14, 2) > 59 || number(17, 2) > 59)
        invalid("Timestamp contains an invalid calendar date or time.");
    std::string fraction;
    if (input.size() != 20) {
        if (input[19] != '.' || input.size() < 22) invalid("Timestamp fractions require one to six digits.");
        fraction = std::string(input.substr(20, input.size() - 21));
        if (!std::all_of(fraction.begin(), fraction.end(), digit)) invalid("Invalid timestamp fraction.");
    }
    fraction.append(6 - fraction.size(), '0');
    *value = std::string(input.substr(0, 19)) + "." + fraction + "Z";
}
}  // namespace

HistoryEditor RecoveryWriteService::getHistory(std::int64_t midiId) {
    positive(midiId);
    return repository_.getHistory(midiId);
}
SourceWriteResult RecoveryWriteService::saveSource(std::int64_t midiId, std::int64_t sourceId,
    std::int64_t revision, HistoricalSource source) {
    writeIds(midiId, sourceId, revision);
    requiredText(source.websiteName, 300);
    optionalText(source.notes, 20000);
    if (source.sourceType != "original_site" && source.sourceType != "forum" && source.sourceType != "mailing_list" &&
        source.sourceType != "archive" && source.sourceType != "search_index" &&
        source.sourceType != "personal_collection" && source.sourceType != "other")
        invalid("Unknown historical source type.");
    if (source.credibility < 1 || source.credibility > 5) invalid("Credibility must be between 1 and 5.");
    url(source.originalUrl);
    url(source.waybackUrl);
    utcTimestamp(source.firstSeenAt);
    utcTimestamp(source.lastSeenAt);
    utcTimestamp(source.checkedAt);
    if (source.firstSeenAt && source.lastSeenAt && *source.firstSeenAt > *source.lastSeenAt)
        invalid("First seen time must not be later than last seen time.");
    return repository_.saveSource(midiId, sourceId, revision, source);
}
EventWriteResult RecoveryWriteService::saveEvent(std::int64_t midiId, std::int64_t eventId,
    std::int64_t revision, RecoveryEvent event) {
    writeIds(midiId, eventId, revision);
    requiredText(event.story, 20000);
    optionalText(event.evidence, 20000);
    utcTimestamp(event.recoveredAt);
    if (event.recoveredBy) positive(*event.recoveredBy);
    if (event.recoveredByName) {
        if (event.recoveredByName->size() > 300 || event.recoveredByName->find('\0') != std::string::npos) invalid("Recovered-by name must be at most 300 UTF-8 bytes.");
        const auto first = event.recoveredByName->find_first_not_of(" \t\r\n");
        if (first == std::string::npos) event.recoveredByName.reset();
        else *event.recoveredByName = event.recoveredByName->substr(first, event.recoveredByName->find_last_not_of(" \t\r\n") - first + 1);
    }
    noNul(event.createdAt);
    if (event.recoveredByName) noNul(*event.recoveredByName);
    return repository_.saveEvent(midiId, eventId, revision, event);
}
DeleteResult RecoveryWriteService::deleteSource(std::int64_t midiId, std::int64_t sourceId, std::int64_t revision) {
    writeIds(midiId, sourceId, revision);
    positive(sourceId);
    return repository_.deleteSource(midiId, sourceId, revision);
}
DeleteResult RecoveryWriteService::deleteEvent(std::int64_t midiId, std::int64_t eventId, std::int64_t revision) {
    writeIds(midiId, eventId, revision);
    positive(eventId);
    return repository_.deleteEvent(midiId, eventId, revision);
}
}  // namespace lostmidi::recovery
