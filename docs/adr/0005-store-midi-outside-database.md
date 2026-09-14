# 0005 — Store MIDI outside the database

## Status
Accepted

## Context
一个作品可能对应多个 MIDI 文件。二进制文件需要按内容识别，并为将来的对象存储迁移留出边界。

## Decision
PostgreSQL 保存元数据、SHA-256 和 storage_key；二进制通过 IObjectStorage 保存。当前使用 LocalObjectStorage，未来可以实现 S3ObjectStorage。

## Alternatives
数据库 BLOB 简化了单次事务，但增加备份体积并耦合存储方式；当前直接引入 S3 增加本地开发成本。

## Consequences
数据库与文件需要分别备份。将来上传流程必须协调文件写入、元数据事务和失败清理。公开 API 不返回内部存储路径。来源记录与分发许可分开表达。
