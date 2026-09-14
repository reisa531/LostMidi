#pragma once
#include <string>
namespace lostmidi::auth {
bool validPasswordHash(const std::string& encoded);
bool verifyPassword(const std::string& password, const std::string& encoded);
std::string randomToken();
std::string digest(const std::string& value);
}
