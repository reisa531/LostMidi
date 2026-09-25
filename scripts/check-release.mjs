import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { validateChangelog, newerVersion } from "../frontend/scripts/check-changelog.mjs";

const changelog = "frontend/src/lib/changelog.json";
const zero = /^0{40}$/;
const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

function sha(value) {
  assert.match(value, /^[a-f0-9]{40}$/, "必须提供完整的 Git 提交 SHA");
  return value;
}

function jsonAt(commit, path) {
  return JSON.parse(git("show", `${sha(commit)}:${path}`));
}

export function validateUpdate(previous, current, previousVersion, currentVersion) {
  validateChangelog(current, currentVersion);
  assert(newerVersion(currentVersion, previousVersion), "本次推送必须提升版本号并新增更新日志");
  if (previous) {
    validateChangelog(previous, previousVersion);
    assert(current.length > previous.length, "本次推送必须新增版本日志");
    assert.deepEqual(current.slice(-previous.length), previous, "历史更新日志不可删除或改写");
  }
}

export function checkRelease(base, head) {
  sha(head);
  const manifest = jsonAt(head, "frontend/package.json");
  const current = jsonAt(head, changelog);
  const lock = jsonAt(head, "frontend/package-lock.json");
  validateChangelog(current, manifest.version);
  assert.equal(lock.version, manifest.version, "lockfile 版本必须同步");
  assert.equal(lock.packages[""].version, manifest.version, "lockfile 根包版本必须同步");
  if (!base || zero.test(base)) {
    const main = git("rev-parse", "--verify", "refs/remotes/origin/main");
    base = git("merge-base", sha(main), head);
  }
  sha(base);
  if (!git("diff", "--name-only", base, head, "--")) return;
  const previous = git("ls-tree", "--name-only", base, "--", changelog) ? jsonAt(base, changelog) : null;
  validateUpdate(previous, current, jsonAt(base, "frontend/package.json").version, manifest.version);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === "--pre-push") {
      for (const line of readFileSync(0, "utf8").trim().split("\n").filter(Boolean)) {
        const [localRef, head, remoteRef, base] = line.trim().split(/\s+/);
        assert(localRef && remoteRef, "推送引用无效");
        if (!zero.test(head)) checkRelease(base, head);
      }
    } else if (process.argv[2] === "--ci") {
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
      const head = event.pull_request?.head.sha || process.env.GITHUB_SHA;
      const base = event.pull_request
        ? git("merge-base", sha(event.pull_request.base.sha), sha(head))
        : event.before;
      checkRelease(base, head);
    } else {
      assert.equal(process.argv.length, 4, "用法：node scripts/check-release.mjs <base-sha> <head-sha>");
      checkRelease(process.argv[2], process.argv[3]);
    }
    console.log("发布校验通过：版本号与新增日志一致，历史记录完整。");
  } catch (error) {
    console.error("发布校验失败：" + error.message);
    process.exitCode = 1;
  }
}
