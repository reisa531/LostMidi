import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { newerVersion, validateChangelog } from "../frontend/scripts/check-changelog.mjs";
import { validateUpdate } from "./check-release.mjs";

const releaseUrl = new URL("./check-release.mjs", import.meta.url);
const releasePath = fileURLToPath(releaseUrl);
const zero = "0".repeat(40);
const entry = (version, overrides = {}) => ({
  version,
  date: "2026-09-01",
  title: `Release ${version}`,
  changes: [`Changes for ${version}`],
  ...overrides,
});

function isolatedEnvironment(root) {
  const env = {};
  for (const key of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "PATHEXT"]) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return {
    ...env,
    HOME: root,
    USERPROFILE: root,
    XDG_CONFIG_HOME: root,
    APPDATA: root,
    LOCALAPPDATA: root,
    TMPDIR: root,
    TMP: root,
    TEMP: root,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_SYSTEM: join(root, "absent-system.gitconfig"),
    GIT_CONFIG_GLOBAL: join(root, "absent-global.gitconfig"),
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "Never",
  };
}

function repository(t, { bootstrap = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), "lostmidi-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  const cwd = join(root, "repo");
  mkdirSync(cwd);
  const env = isolatedEnvironment(root);
  const git = (...args) => execFileSync("git", args, {
    cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
  }).trim();
  const write = (path, value) => {
    const absolute = join(cwd, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
  };
  const release = (version, entries = [entry(version)], lockVersion = version, rootVersion = version) => {
    write("frontend/package.json", { name: "release-test-fixture", private: true, version });
    write("frontend/package-lock.json", {
      name: "release-test-fixture", version: lockVersion, lockfileVersion: 3,
      packages: { "": { name: "release-test-fixture", version: rootVersion } },
    });
    if (entries !== null) write("frontend/src/lib/changelog.json", entries);
  };
  const commit = (message, { empty = false } = {}) => {
    git("add", "--", "frontend", "app.txt");
    git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit",
      ...(empty ? ["--allow-empty"] : []), "-m", message);
    return git("rev-parse", "HEAD");
  };
  const run = (args, options = {}) => spawnSync(process.execPath, args, {
    cwd, env: { ...env, ...options.env }, input: options.input ?? "",
    encoding: "utf8", timeout: 30000,
  });
  const cli = (base, head) => run([releasePath, base, head]);
  const direct = (base, head) => run([
    "--input-type=module", "--eval",
    `import { checkRelease } from ${JSON.stringify(releaseUrl.href)}; checkRelease(...JSON.parse(process.argv[1]));`,
    JSON.stringify([base, head]),
  ]);
  const prePush = input => run([releasePath, "--pre-push"], { input });
  const ci = (event, head) => {
    const eventPath = join(root, "event.json");
    writeFileSync(eventPath, JSON.stringify(event));
    return run([releasePath, "--ci"], {
      env: { GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: head },
    });
  };
  git("init", "--initial-branch=main", "--object-format=sha1");
  release("1.0.0", bootstrap ? null : [entry("1.0.0")]);
  write("app.txt", "initial application\n");
  const base = commit("Initial fixture");
  return { root, cwd, git, write, release, commit, base, cli, direct, prePush, ci };
}

function succeeds(result) {
  assert.ifError(result.error);
  assert.equal(result.signal, null, `Child terminated: ${result.signal}`);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function rejects(result, message) {
  assert.ifError(result.error);
  assert.equal(result.signal, null, `Child terminated: ${result.signal}`);
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  if (message) assert.match(result.stderr, message);
}

const pushLine = (head, base, branch = "main") =>
  `refs/heads/${branch} ${head} refs/heads/${branch} ${base}\n`;

describe("validateChangelog schema", () => {
  it("accepts valid descending versions, equal dates, and leap days without mutation", () => {
    const entries = [
      entry("1.10.0", { date: "2024-03-01" }),
      entry("1.9.0", { date: "2024-02-29" }),
      entry("1.8.0", { date: "2024-02-29" }),
    ];
    const original = structuredClone(entries);
    assert.doesNotThrow(() => validateChangelog(entries, "1.10.0"));
    assert.deepEqual(entries, original);
  });

  for (const [name, entries] of [["empty array", []], ["null", null], ["non-array", {}]]) {
    it(`rejects ${name}`, () => assert.throws(() => validateChangelog(entries, "1.0.0")));
  }

  for (const [name, overrides] of [
    ["empty title", { title: "" }],
    ["whitespace title", { title: " \t " }],
    ["non-string title", { title: 42 }],
    ["empty changes", { changes: [] }],
    ["non-array changes", { changes: "some change" }],
    ["blank change", { changes: ["valid", " \n "] }],
    ["non-string change", { changes: [42] }],
  ]) {
    it(`rejects ${name}`, () => {
      assert.throws(() => validateChangelog([entry("1.0.0", overrides)], "1.0.0"));
    });
  }

  for (const date of ["", "2026/09/01", "2026-9-01", "2026-02-30", "2025-02-29", "2026-13-01", 20260901]) {
    it(`rejects invalid date ${JSON.stringify(date)}`, () => {
      assert.throws(() => validateChangelog([entry("1.0.0", { date })], "1.0.0"), /发布日期/);
    });
  }

  it("rejects duplicate versions", () => {
    assert.throws(() => validateChangelog([entry("1.0.0"), entry("1.0.0")], "1.0.0"), /版本必须唯一/);
  });
  it("rejects versions ordered oldest first", () => {
    assert.throws(() => validateChangelog([entry("1.0.0"), entry("1.1.0")], "1.0.0"), /新到旧/);
  });
  it("rejects dates ordered oldest first", () => {
    assert.throws(() => validateChangelog([
      entry("1.1.0", { date: "2026-08-31" }), entry("1.0.0"),
    ], "1.1.0"), /发布日期必须按新到旧/);
  });
  it("requires the newest entry to match the package version", () => {
    assert.throws(() => validateChangelog([entry("1.0.0")], "1.1.0"), /package\.json/);
  });
  it("validates older entries as well as the newest entry", () => {
    assert.throws(() => validateChangelog([
      entry("1.1.0"), entry("1.0.0", { changes: [] }),
    ], "1.1.0"), /更新内容/);
  });
});

describe("newerVersion numeric ordering", () => {
  for (const [next, previous, expected] of [
    ["0.0.10", "0.0.9", true],
    ["0.10.0", "0.9.0", true],
    ["10.0.0", "9.0.0", true],
    ["1.0.0", "0.99.99", true],
    ["1.10.0", "1.9.99", true],
    ["1.0.0", "1.0.0", false],
    ["1.0.9", "1.0.10", false],
    ["1.9.99", "1.10.0", false],
    ["9.99.99", "10.0.0", false],
  ]) {
    it(`${next} > ${previous} is ${expected}`, () => {
      assert.equal(newerVersion(next, previous), expected);
    });
  }
  for (const invalid of [null, 1, "1.0", "v1.0.0", "01.0.0", "-1.0.0", "1.0.0-beta", "9007199254740992.0.0"]) {
    it(`rejects malformed/unsafe version ${JSON.stringify(invalid)} in either argument`, () => {
      assert.throws(() => newerVersion(invalid, "1.0.0"));
      assert.throws(() => newerVersion("1.0.0", invalid));
    });
  }
});

describe("validateUpdate append-only release history", () => {
  const previous = [entry("1.1.0"), entry("1.0.0")];
  it("accepts one prepended release and does not mutate inputs", () => {
    const current = [entry("1.2.0"), ...structuredClone(previous)];
    const original = structuredClone({ previous, current });
    assert.doesNotThrow(() => validateUpdate(previous, current, "1.1.0", "1.2.0"));
    assert.deepEqual({ previous, current }, original);
  });
  it("accepts multiple prepended releases in one push", () => {
    assert.doesNotThrow(() => validateUpdate(previous,
      [entry("2.0.0"), entry("1.2.0"), ...previous], "1.1.0", "2.0.0"));
  });
  it("rejects unchanged and decreasing versions", () => {
    assert.throws(() => validateUpdate(previous, previous, "1.1.0", "1.1.0"), /提升版本号/);
    assert.throws(() => validateUpdate(previous, [entry("1.0.0")], "1.1.0", "1.0.0"), /提升版本号/);
  });
  it("rejects a bumped version without an additional entry", () => {
    assert.throws(() => validateUpdate(previous,
      [entry("1.2.0"), entry("1.0.0")], "1.1.0", "1.2.0"), /新增版本日志/);
  });
  for (const [name, current] of [
    ["deleted historical entry", [entry("1.3.0"), entry("1.2.0"), previous[0]]],
    ["rewritten historical title", [entry("1.2.0"), { ...previous[0], title: "rewritten" }, previous[1]]],
    ["rewritten historical changes", [entry("1.2.0"), { ...previous[0], changes: ["rewritten"] }, previous[1]]],
    ["inserted historical entry", [entry("1.2.0"), previous[0], entry("1.0.1"), previous[1]]],
    ["appended older entry", [entry("1.2.0"), ...previous, entry("0.9.0")]],
  ]) {
    it(`rejects ${name}`, () => {
      assert.throws(() => validateUpdate(previous, current, "1.1.0", current[0].version), /历史更新日志/);
    });
  }
  it("allows bootstrap without historical changelog only with a version increase", () => {
    assert.doesNotThrow(() => validateUpdate(null, [entry("1.1.0")], "1.0.0", "1.1.0"));
    assert.throws(() => validateUpdate(null, [entry("1.0.0")], "1.0.0", "1.0.0"), /提升版本号/);
    assert.throws(() => validateUpdate(null, [entry("0.9.0")], "1.0.0", "0.9.0"), /提升版本号/);
  });
});

describe("committed Git releases and CLI", () => {
  it("accepts full SHA commits through checkRelease and the positional CLI", t => {
    const repo = repository(t);
    repo.release("1.1.0", [entry("1.1.0"), entry("1.0.0")]);
    const head = repo.commit("Release 1.1.0");
    assert.match(repo.base, /^[a-f0-9]{40}$/);
    assert.match(head, /^[a-f0-9]{40}$/);
    succeeds(repo.direct(repo.base, head));
    succeeds(repo.cli(repo.base, head));
    for (const invalid of [head.slice(0, 7), "HEAD", "g".repeat(40)]) {
      rejects(repo.cli(repo.base, invalid), /完整的 Git 提交 SHA/);
      rejects(repo.cli(invalid, head), /完整的 Git 提交 SHA/);
    }
  });

  it("allows identical commits and different commits with identical trees", t => {
    const repo = repository(t);
    succeeds(repo.direct(repo.base, repo.base));
    const head = repo.commit("No tree changes", { empty: true });
    assert.notEqual(head, repo.base);
    assert.equal(repo.git("rev-parse", `${repo.base}^{tree}`), repo.git("rev-parse", `${head}^{tree}`));
    succeeds(repo.cli(repo.base, head));
    succeeds(repo.prePush(pushLine(head, repo.base)));
  });

  it("rejects changed code with an unchanged version", t => {
    const repo = repository(t);
    repo.write("app.txt", "changed without a release\n");
    const head = repo.commit("Change code without version bump");
    rejects(repo.direct(repo.base, head), /提升版本号/);
    rejects(repo.prePush(pushLine(head, repo.base)), /提升版本号/);
  });

  it("rejects a version bump with no matching new changelog entry", t => {
    const repo = repository(t);
    repo.release("1.1.0", [entry("1.0.0")]);
    const head = repo.commit("Bump version but leave old log");
    rejects(repo.cli(repo.base, head), /最新日志版本必须与 package\.json 一致/);
  });

  it("rejects a deleted changelog file", t => {
    const repo = repository(t);
    repo.release("1.1.0");
    rmSync(join(repo.cwd, "frontend/src/lib/changelog.json"));
    const head = repo.commit("Delete changelog");
    rejects(repo.cli(repo.base, head), /changelog\.json/);
  });

  it("rejects deleted or rewritten committed historical entries", t => {
    const repo = repository(t);
    repo.release("1.1.0", [entry("1.1.0")]);
    const deleted = repo.commit("Drop old release history");
    rejects(repo.cli(repo.base, deleted), /新增版本日志/);
    repo.release("1.1.0", [entry("1.1.0"), entry("1.0.0", { title: "rewritten" })]);
    const rewritten = repo.commit("Rewrite old release history");
    rejects(repo.cli(repo.base, rewritten), /历史更新日志/);
  });

  it("requires both lockfile versions to match the committed package version", t => {
    const repo = repository(t);
    const entries = [entry("1.1.0"), entry("1.0.0")];
    repo.release("1.1.0", entries, "1.0.0", "1.1.0");
    const badTopLevel = repo.commit("Leave stale top-level lock version");
    rejects(repo.cli(repo.base, badTopLevel), /lockfile 版本必须同步/);
    repo.release("1.1.0", entries, "1.1.0", "1.0.0");
    const badRoot = repo.commit("Leave stale root-package lock version");
    rejects(repo.cli(repo.base, badRoot), /lockfile 根包版本必须同步/);
  });

  it("does not let working-tree or staged logs satisfy validation of committed data", t => {
    const repo = repository(t);
    repo.write("app.txt", "committed source-only change\n");
    const head = repo.commit("Code change lacking a release");
    repo.release("1.1.0", [entry("1.1.0"), entry("1.0.0")]);
    rejects(repo.cli(repo.base, head), /提升版本号/);
    repo.git("add", "--", "frontend");
    rejects(repo.prePush(pushLine(head, repo.base)), /提升版本号/);
    const released = repo.commit("Commit the release metadata");
    succeeds(repo.cli(repo.base, released));
    repo.write("frontend/src/lib/changelog.json", "invalid worktree JSON\n");
    succeeds(repo.cli(repo.base, released));
  });

  it("requires a version bump when bootstrapping a repository with no old changelog", t => {
    const repo = repository(t, { bootstrap: true });
    repo.release("1.0.0");
    const unchanged = repo.commit("Add first changelog without bump");
    rejects(repo.cli(repo.base, unchanged), /提升版本号/);
    repo.release("1.1.0");
    const head = repo.commit("Bump version for first changelog");
    succeeds(repo.cli(repo.base, head));
  });

  it("uses the origin/main merge base for a new branch and the PR merge base in CI", t => {
    const repo = repository(t);
    repo.git("update-ref", "refs/remotes/origin/main", repo.base);
    repo.git("switch", "-c", "release-feature");
    repo.write("app.txt", "feature without a release\n");
    const unchanged = repo.commit("Unreleased feature");
    rejects(repo.prePush(pushLine(unchanged, zero, "release-feature")), /提升版本号/);
    repo.release("1.1.0", [entry("1.1.0"), entry("1.0.0")]);
    const head = repo.commit("Release feature 1.1.0");

    repo.git("switch", "main");
    repo.release("1.2.0", [entry("1.2.0"), entry("1.0.0")]);
    const main = repo.commit("Divergent main release 1.2.0");
    repo.git("update-ref", "refs/remotes/origin/main", main);
    repo.git("switch", "release-feature");
    assert.equal(repo.git("merge-base", main, head), repo.base);
    succeeds(repo.direct(null, head));
    succeeds(repo.cli(zero, head));
    succeeds(repo.prePush(pushLine(head, zero, "release-feature")));
    succeeds(repo.ci({ before: zero, after: head }, head));
    succeeds(repo.ci({ pull_request: { base: { sha: main }, head: { sha: head } } }, main));
  });

  it("fails closed for a new branch when no origin/main baseline exists", t => {
    const repo = repository(t);
    repo.release("1.1.0", [entry("1.1.0"), entry("1.0.0")]);
    const head = repo.commit("Release without a remote baseline");
    rejects(repo.prePush(pushLine(head, zero, "feature")), /origin\/main/);
  });

  it("validates all commits in the pushed range and supports multiple new releases", t => {
    const repo = repository(t);
    repo.write("app.txt", "first feature\n");
    repo.commit("Implement first feature");
    repo.release("1.1.0", [entry("1.1.0"), entry("1.0.0")]);
    const firstRelease = repo.commit("Release 1.1.0");
    repo.write("app.txt", "second feature\n");
    const unreleased = repo.commit("Implement second feature");
    rejects(repo.cli(firstRelease, unreleased), /提升版本号/);
    repo.release("1.2.0", [entry("1.2.0"), entry("1.1.0"), entry("1.0.0")]);
    const head = repo.commit("Release 1.2.0");
    succeeds(repo.cli(repo.base, head));
    succeeds(repo.cli(firstRelease, head));
    succeeds(repo.prePush(pushLine(firstRelease, repo.base, "first") + pushLine(head, firstRelease, "second")));
    rejects(repo.prePush(pushLine(firstRelease, repo.base, "first") + pushLine(unreleased, firstRelease, "second")), /提升版本号/);
  });

  it("reads push event baselines from GITHUB_EVENT_PATH in CI", t => {
    const repo = repository(t);
    repo.release("1.1.0", [entry("1.1.0"), entry("1.0.0")]);
    const released = repo.commit("Release 1.1.0");
    succeeds(repo.ci({ before: repo.base, after: released }, released));
    repo.write("app.txt", "later unreleased change\n");
    const head = repo.commit("Later source-only change");
    rejects(repo.ci({ before: released, after: head }, head), /提升版本号/);
    rejects(repo.ci({ before: released.slice(0, 7), after: head }, head), /完整的 Git 提交 SHA/);
  });

  it("skips deleted refs and still validates other refs in pre-push stdin", t => {
    const repo = repository(t);
    const deletion = `(delete) ${zero} refs/heads/retired ${repo.base}\n`;
    succeeds(repo.prePush(deletion));
    succeeds(repo.prePush(""));
    succeeds(repo.prePush(deletion + pushLine(repo.base, repo.base)));
    repo.write("app.txt", "unreleased change\n");
    const head = repo.commit("Invalid release after deleted ref");
    rejects(repo.prePush(deletion + pushLine(head, repo.base)), /提升版本号/);
  });
});
