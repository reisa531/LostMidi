cmake_minimum_required(VERSION 3.24)
project(LostMidiArchive VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_EXTENSIONS OFF)
find_package(Drogon CONFIG REQUIRED)
find_package(OpenSSL CONFIG REQUIRED)

add_library(lostmidi_options INTERFACE)
target_compile_features(lostmidi_options INTERFACE cxx_std_20)
if(MSVC)
    target_compile_options(lostmidi_options INTERFACE /W4 /permissive- /utf-8)
    # Read-only std::getenv is portable; environment is not mutated by this process.
    target_compile_definitions(lostmidi_options INTERFACE _CRT_SECURE_NO_WARNINGS)
else()
    target_compile_options(lostmidi_options INTERFACE -Wall -Wextra -Wpedantic)
endif()

add_library(lostmidi_core
    src/person/PersonWriteService.cpp
    src/recovery/RecoveryWriteService.cpp
    src/auth/Password.cpp
    src/midi/MidiWriteService.cpp
    src/midi/MidiService.cpp
    src/midi/MidiFileService.cpp
    src/storage/Sha256.cpp
    src/storage/LocalObjectStorage.cpp)
target_include_directories(lostmidi_core PUBLIC src)
target_link_libraries(lostmidi_core PUBLIC lostmidi_options PRIVATE OpenSSL::Crypto)

add_library(lostmidi_postgres
    src/auth/AuthService.cpp
    src/midi/PostgresMidiRepository.cpp
    src/person/PostgresPersonRepository.cpp
    src/recovery/PostgresRecoveryRepository.cpp)
target_link_libraries(lostmidi_postgres PUBLIC lostmidi_core Drogon::Drogon)

add_executable(lostmidi_api src/main.cpp src/common/ApiController.cpp
    src/common/AdminController.cpp src/common/AdminRecoveryController.cpp)
target_link_libraries(lostmidi_api PRIVATE lostmidi_postgres)

include(CTest)
if(BUILD_TESTING)
    find_package(GTest CONFIG REQUIRED)
    add_executable(lostmidi_tests tests/services_test.cpp tests/repository_integration_test.cpp tests/admin_test.cpp)
    target_link_libraries(lostmidi_tests PRIVATE lostmidi_postgres GTest::gtest_main)
    include(GoogleTest)
    gtest_discover_tests(lostmidi_tests)
endif()

install(TARGETS lostmidi_api RUNTIME DESTINATION bin)
