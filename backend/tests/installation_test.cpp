#include <gtest/gtest.h>
#include "installation/InstallationService.h"
#include "auth/AuthService.h"
#include "auth/Password.h"
#include <future>
#include <vector>

using namespace lostmidi;
namespace {
Json::Value installationBody() {
    Json::Value body;
    body["site_name"] = "  Test archive \t";
    body["site_description"] = "  Description \n";
    body["username"] = "test-admin";
    body["password"] = "installation-only-password";
    return body;
}
template<class Work> void expectApiError(Work work, int status, const std::string& code) {
    try { work(); FAIL() << "Expected API error " << code; }
    catch (const ApiError& error) { EXPECT_EQ(error.status, status); EXPECT_EQ(error.code, code); }
}
TEST(InstallationInput, NormalizesOnlySiteTextAndCountsUtf8Bytes) {
    auto body = installationBody();
    auto parsed = installation::parseInput(body);
    EXPECT_EQ(parsed.site.name, "Test archive");
    EXPECT_EQ(parsed.site.description, "Description");
    body["site_name"] = "\u3000档案\u00a0";
    body["site_description"] = "\u3000\t";
    body["password"] = " 1234567890 ";
    parsed = installation::parseInput(body);
    EXPECT_EQ(parsed.site.name, "档案");
    EXPECT_TRUE(parsed.site.description.empty());
    EXPECT_EQ(parsed.password, " 1234567890 ");
    body["site_name"] = std::string(198, 'x') + "档";
    expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
    body["site_name"] = std::string(197, 'x') + "档";
    body["site_description"] = std::string(997, 'x') + "档";
    body["username"] = std::string(64, 'a');
    body["password"] = std::string(1021, 'p') + "档";
    EXPECT_NO_THROW(installation::parseInput(body));
    body["password"] = std::string(1022, 'p') + "档";
    expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
}
TEST(InstallationInput, RejectsUnknownMissingAndNonStringFields) {
    auto body = installationBody();
    body["database_url"] = "not-accepted";
    expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
    expectApiError([&] { installation::parseInput(Json::Value(Json::arrayValue)); }, 400, "INVALID_INPUT");
    expectApiError([&] { installation::parseInput(Json::Value{}); }, 400, "INVALID_INPUT");
    const std::vector<Json::Value> wrongTypes{Json::Value{}, Json::Value(true), Json::Value(1), Json::Value(1.5),
        Json::Value(Json::arrayValue), Json::Value(Json::objectValue)};
    for (const char* field : {"site_name", "site_description", "username", "password"}) {
        body = installationBody();
        body.removeMember(field);
        expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
        for (const auto& value : wrongTypes) {
            body = installationBody(); body[field] = value;
            expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
        }
    }
}
TEST(InstallationInput, RejectsInvalidLengthsUsernamesNulAndUtf8) {
    auto body = installationBody();
    for (const auto& name : {std::string{}, std::string(" \t\u3000"), std::string(201, 'x')}) {
        body["site_name"] = name;
        expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
    }
    body = installationBody(); body["site_description"] = std::string(1001, 'x');
    expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
    for (const auto& username : {std::string("ab"), std::string(65, 'a'), std::string(" abc"),
                                std::string("abc "), std::string("用户"), std::string("a:b")}) {
        body = installationBody(); body["username"] = username;
        expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
    }
    body = installationBody(); body["username"] = "A_-.09";
    EXPECT_NO_THROW(installation::parseInput(body));
    for (const auto length : {0, 11, 1025}) {
        body = installationBody(); body["password"] = std::string(length, 'p');
        expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
    }
    for (const char* field : {"site_name", "site_description", "username", "password"}) {
        for (const auto& value : {std::string("abc\0defghijkl", 13), std::string("\xc0\xaf"),
                                 std::string("\xed\xa0\x80"), std::string("\xf4\x90\x80\x80"), std::string("\xe4\xb8")}) {
            body = installationBody(); body[field] = value;
            expectApiError([&] { installation::parseInput(body); }, 400, "INVALID_INPUT");
        }
    }
}
TEST(InstallationSecurity, TokenConfigurationAndConstantTimeDigestComparison) {
    for (const auto& value : {std::string{}, std::string(31, 'a'), std::string(129, 'a'),
                             std::string(31, 'a') + " ", std::string(31, 'a') + ".", std::string(32, '\0')})
        EXPECT_FALSE(installation::validInstallationToken(value));
    EXPECT_TRUE(installation::validInstallationToken(std::string(32, 'a')));
    EXPECT_TRUE(installation::validInstallationToken(std::string(126, 'a') + "_-"));
    EXPECT_TRUE(auth::constantTimeEqual("same", "same"));
    EXPECT_FALSE(auth::constantTimeEqual("same", "different-length"));
    EXPECT_FALSE(auth::constantTimeEqual("same", "samE"));
    installation::InstallationRepository unused(nullptr);
    installation::AttemptLimiter limiter;
    EXPECT_NO_THROW(installation::InstallationService(unused, "", false, limiter));
    EXPECT_THROW(installation::InstallationService(unused, "bad", false, limiter), std::runtime_error);
    EXPECT_THROW(installation::InstallationService(unused, "bad", true, limiter), std::runtime_error);
    auth::AuthRepository authRepository(nullptr);
    EXPECT_THROW(auth::AuthService(authRepository, "admin", "plaintext"), std::runtime_error);
}
TEST(InstallationSecurity, RateLimitHasTenAttemptsAcrossConcurrentCalls) {
    installation::AttemptLimiter limiter;
    std::vector<std::future<int>> calls;
    for (int i = 0; i < 20; ++i) calls.push_back(std::async(std::launch::async, [&] {
        try { limiter.acquire(); return 1; }
        catch (const ApiError& error) {
            EXPECT_EQ(error.status, 429); EXPECT_EQ(error.code, "INSTALLATION_RATE_LIMITED"); return 0;
        }
    }));
    int admitted = 0;
    for (auto& call : calls) admitted += call.get();
    EXPECT_EQ(admitted, 10);
    expectApiError([&] { limiter.acquire(); }, 429, "INSTALLATION_RATE_LIMITED");
    EXPECT_EQ(&installation::processLimiter(), &installation::processLimiter());
}
TEST(AdminPassword, GeneratesRandomSaltInExistingVerificationFormat) {
    const std::string password = "  安装-password  ";
    const auto first = auth::hashPassword(password), second = auth::hashPassword(password);
    EXPECT_TRUE(auth::validPasswordHash(first));
    EXPECT_TRUE(auth::validPasswordHash(second));
    EXPECT_NE(first, second);
    EXPECT_NE(first.substr(21, 32), second.substr(21, 32));
    EXPECT_TRUE(auth::verifyPassword(password, first));
    EXPECT_TRUE(auth::verifyPassword(password, second));
    EXPECT_FALSE(auth::verifyPassword("安装-password", first));
    EXPECT_FALSE(auth::verifyPassword("wrong-password", first));
    EXPECT_THROW(auth::hashPassword(std::string(11, 'p')), std::invalid_argument);
    EXPECT_THROW(auth::hashPassword(std::string(1025, 'p')), std::invalid_argument);
    EXPECT_THROW(auth::hashPassword(std::string("password\0with-nul", 17)), std::invalid_argument);
}
}  // namespace
