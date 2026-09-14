# 0003 — Use PostgreSQL

## Status
Accepted

## Context
人物署名、多个文件版本和历史事件构成关系数据。文件哈希去重必须由数据库保证并发下的一致性。

## Decision
采用 PostgreSQL、显式外键、CHECK 和 UNIQUE 约束。Schema 由有序 SQL migration 管理；示例 seed 单独启用。未来搜索优先考虑 PostgreSQL Full Text Search。

## Alternatives
文档数据库不利于约束这些关系；SQLite 适合简单单机应用，但当前目标明确要求 PostgreSQL。额外 ORM 不是当前所需。

## Consequences
关系和约束可以直接阅读和测试。所有环境须执行 migration；已应用的文件不应改写，应新增 migration。数据库仅保存文件元数据。
