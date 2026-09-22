#pragma once
#include <string>
namespace lostmidi::auth {
bool validPasswordHash(const std::string& encoded);
bool verifyPassword(const std::string& password, const std::string& encoded);
std::string hashPassword(const std::string& password);
std::string randomToken();
std::string digest(const std::string& value);
// Compares fixed-size digests in constant time, regardless of input length.
bool constantTimeEqual(const std::string& left, const std::string& right);
}
