#pragma once
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace lostmidi::person {
struct Person {
    std::int64_t id = 0;
    std::string displayName;
    std::optional<std::string> biography;
    std::string createdAt;
    std::int64_t revision = 1;
    std::string publicId;
    std::optional<std::string> summary;
    std::string profile = "{}";
    std::string updatedAt;
};
struct Credit {
    std::int64_t personId = 0;
    std::string displayName;
    std::string role;
};
struct CreditedMidi {
    std::int64_t id = 0;
    std::string slug;
    std::string title;
    std::string role;
    std::string publicId;
};
struct PersonDetail {
    Person person;
    std::vector<std::string> aliases;
    std::vector<CreditedMidi> midis;
    std::optional<Person> previous;
    std::optional<Person> next;
};
}  // namespace lostmidi::person
