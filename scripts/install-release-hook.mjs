import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const configured = spawnSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" });
assert.equal(configured.status, 1, "已配置自定义 hooksPath，请手动将发布校验串联到现有 pre-push；不会覆盖配置");
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const path = resolve(root, execFileSync("git", ["rev-parse", "--git-path", "hooks/pre-push"], { encoding: "utf8" }).trim());
const hook = '#!/bin/sh\n# LostMidi release changelog gate\nnode "$(git rev-parse --show-toplevel)/scripts/check-release.mjs" --pre-push\n';
if (existsSync(path)) {
  assert.equal(readFileSync(path, "utf8"), hook, "已有 pre-push，不会覆盖；请手动串联发布校验");
} else {
  writeFileSync(path, hook, { flag: "wx", mode: 0o755 });
}
chmodSync(path, 0o755);
console.log("已安装更新日志 pre-push 校验；未修改 Git 配置或其他钩子。");
