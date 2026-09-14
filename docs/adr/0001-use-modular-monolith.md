# 0001 — Use a modular monolith

## Status
Accepted

## Context
项目由一名维护者持续开发。MIDI、人物和寻回记录联系紧密，当前没有独立部署或独立扩容的需求。

## Decision
后端使用一个可执行程序和一个 PostgreSQL 数据库，按业务领域组织源码。Controller、Service、Repository 分别处理 HTTP、业务规则和持久化。

## Alternatives
微服务增加网络通信、部署和一致性成本；将所有逻辑放在 Controller 中则难以测试和理解。

## Consequences
部署和调试简单。模块通过明确的接口合作，增加模块时不必拆服务；需要持续避免 Controller 越过 Service 操作数据库。
