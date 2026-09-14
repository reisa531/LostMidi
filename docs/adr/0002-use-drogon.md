# 0002 — Use Drogon

## Status
Accepted

## Context
本项目同时用于学习现代 C++ 工程，需要 HTTP 路由、JSON、PostgreSQL 连接池和清晰的依赖管理。

## Decision
采用 C++20、Drogon、Conan 2 和基于 target 的 CMake。用 Drogon 的数据库客户端执行参数化 SQL，保留普通 C++ 领域模型。

## Alternatives
手写 HTTP 或组合低层网络库会把维护重点移到基础设施；换用其他语言不符合项目学习目标。

## Consequences
无需自行实现 HTTP 协议和数据库连接池。原生 C++ 环境需要编译器和依赖工具；Docker 提供统一入口。同步查询放在独立工作线程执行，避免阻塞 HTTP 事件循环。
