import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function versionParts(version) {
  assert.equal(typeof version, "string", "版本号必须是字符串");
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, "版本号必须采用 major.minor.patch");
  const parts = version.split(".").map(Number);
  assert(parts.every(Number.isSafeInteger), "版本号超出安全整数范围");
  return parts;
}

export function newerVersion(next, previous) {
  const a = versionParts(next), b = versionParts(previous);
  const index = a.findIndex((part, i) => part !== b[i]);
  return index >= 0 && a[index] > b[index];
}

export function validateChangelog(entries, version) {
  assert(Array.isArray(entries) && entries.length > 0, "更新日志不能为空");
  versionParts(version);
  assert.equal(entries[0].version, version, "最新日志版本必须与 package.json 一致");
  entries.forEach((entry, index) => {
    assert(entry && typeof entry === "object", "日志条目无效");
    versionParts(entry.version);
    assert.equal(typeof entry.date, "string", "发布日期无效");
    assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/, "发布日期必须采用 YYYY-MM-DD");
    const date = new Date(entry.date);
    assert(!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === entry.date, "发布日期不存在");
    assert(typeof entry.title === "string" && entry.title.trim(), "日志标题不能为空");
    assert(Array.isArray(entry.changes) && entry.changes.length > 0, "每个版本必须包含更新内容");
    assert(entry.changes.every(change => typeof change === "string" && change.trim()), "更新内容不能为空");
    if (index > 0) {
      assert(newerVersion(entries[index - 1].version, entry.version), "版本必须唯一且按新到旧排列");
      assert(entries[index - 1].date >= entry.date, "发布日期必须按新到旧排列");
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL("../", import.meta.url);
  const entries = JSON.parse(readFileSync(new URL("src/lib/changelog.json", root), "utf8"));
  const manifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  const lock = JSON.parse(readFileSync(new URL("package-lock.json", root), "utf8"));
  validateChangelog(entries, manifest.version);
  assert.equal(lock.version, manifest.version, "lockfile 版本必须同步");
  assert.equal(lock.packages[""].version, manifest.version, "lockfile 根包版本必须同步");
  console.log(`更新日志校验通过：v${manifest.version}`);
}
