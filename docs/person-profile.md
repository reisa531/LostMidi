# 人物结构化资料

人物 `/api/v1/admin/people` 的 `profile` 为可选 JSON 对象。旧客户端未传 `profile` 或 `summary` 时，更新会保留数据库现值。公开接口返回 `profile` 对象和真实 `updated_at`；所有变更仍遵循普通管理员审核、超级管理员直接保存及 revision 冲突检查。

## 字段

| 字段 | 类型与规则 |
| --- | --- |
| `pronunciation` | 可空文本，最多 2,000 字节 |
| `otherNames` | 文本数组，最多 100 项，每项最多 2,000 字节 |
| `gender`, `birthText`, `birthplace`, `residence`, `education` | 可空文本；出生原文允许不确定表达，不自动生成 `birthDate` |
| `birthCertainty` | `unknown`、`approximate`、`confirmed`；原文及来源优先保留 |
| `activePeriod` | `{ start, end, note, certainty, source }` 文本字段，不确定时填写 `certainty: unknown` |
| `roles` | 身份、乐器或工具的文本数组 |
| `aliasDetails` | 最多 50 项 `{name,note,period,source}`；`name` 必须属于兼容昵称 `aliases` |
| `sites` | 最多 100 项 `{name,url,role,status}`；URL 可空，仅允许 http/https |
| `timeline` | 最多 100 项 `{time,event,source,certainty}`，时间使用原文，不伪造精度 |
| `sources` | 最多 100 项 `{id,title,url,archiveNote}`；URL 可空且仅 http/https |
| `sameAs` | 最多 50 个 https URL |
| `works` | 最多 100 项 `{midiId,title,url,role,source}`，`midiId` 使用站内作品 public UUID；站内 public UUID 或外部来源至少一项 |
| `collaborators` | 最多 100 项 `{personId,name,source}`，可关联公开人物或使用姓名 |
| `rights` | 可空 Markdown 文本，最多 20,000 字节 |

profile 序列化总长最多 50,000 字节；别名仍以 `person_aliases` 为唯一搜索和兼容来源。迁移时既有人物的 `updated_at` 以迁移建立时间为基准，之后由数据库触发器维护。页面只渲染有资料的区块。所有未确认事实必须保留不确定标识和出处；只有明确确认、格式有效的生日才可写入结构化生日字段。
