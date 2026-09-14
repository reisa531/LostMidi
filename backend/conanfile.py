from conan import ConanFile
from conan.tools.cmake import cmake_layout


class LostMidiArchive(ConanFile):
    settings = "os", "compiler", "build_type", "arch"
    generators = "CMakeDeps", "CMakeToolchain"
    default_options = {
        "drogon/*:with_postgres": True,
        "drogon/*:with_boost": False,
        "drogon/*:with_mysql": False,
        "drogon/*:with_sqlite": False,
        "drogon/*:with_redis": False,
        "drogon/*:with_ctl": False,
    }

    def requirements(self):
        self.requires("drogon/1.9.13")
        self.requires("openssl/3.6.4")
        self.test_requires("gtest/1.17.0")

    def layout(self):
        cmake_layout(self)
