import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BATCH_SIZE, ENGINES, KEY_FILE_NAME, KEY_FILE_PATH, UsageError, buildPayload, collectSitemapUrls,
  describeStatus, filterSince, normalizeOrigin, parseArgs, parseSitemap, parseSince, planSubmissions,
  readKeyFile, retryDelayMs, run, submitBatch, toBatches, verifyKeyLocation,
} from "./indexnow.mjs";

const ORIGIN = "https://lostmidi.dzhes.xyz";
const KEY = KEY_FILE_NAME.replace(/\.txt$/, "");
const KEY_LOCATION = `${ORIGIN}/${KEY_FILE_NAME}`;

function response({ status = 200, body = "", headers = {} }) {
  const map = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => map.get(String(name).toLowerCase()) ?? null },
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

/** 极简 fetch 替身：routes 以完整 URL 为键，值可以是响应描述或返回响应描述的函数。 */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const key = String(url);
    calls.push({ url: key, init, body: init.body ? JSON.parse(init.body) : undefined });
    const route = routes[key];
    if (route === undefined) throw new Error(`测试未覆盖的请求：${key}`);
    const resolved = typeof route === "function" ? route({ ...init, body: init.body ? JSON.parse(init.body) : undefined }, calls.length) : route;
    if (resolved instanceof Error) throw resolved;
    return response(resolved);
  };
  impl.calls = calls;
  const posts = () => calls.filter(call => call.init?.method === "POST");
  return Object.assign(impl, { calls, posts });
}

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), "lostmidi-indexnow-"));
  t.after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  return root;
}

function urlset(entries) {
  const body = entries.map(([loc, lastmod]) => `<url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}<changefreq>weekly</changefreq><priority>0.7</priority></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function runner({ routes, argv = [], root, env = {} }) {
  const out = [];
  const err = [];
  const fetchImpl = fakeFetch(routes);
  const options = {
    argv, env, fetchImpl, sleep: async () => {},
    stdout: line => out.push(String(line)), stderr: line => err.push(String(line)),
    now: () => new Date("2026-10-02T00:00:00.000Z"),
  };
  if (root) options.argv = [...argv, "--state", join(root, "state.json")];
  return { out, err, fetchImpl, options, text: () => out.join("\n") };
}

describe("key 文件托管", () => {
  it("仓库里的 key 文件位于前端静态根目录，文件名即 key，内容就是 key", () => {
    assert.ok(existsSync(KEY_FILE_PATH), `缺少 key 文件：${KEY_FILE_PATH}`);
    const raw = readFileSync(KEY_FILE_PATH, "utf8");
    assert.ok(!raw.startsWith("\uFEFF"), "key 文件不能带 BOM");
    assert.equal(raw.trim(), KEY, "key 文件内容必须与文件名一致");
    assert.match(KEY, /^[a-f0-9]{32}$/, "当前 key 为 32 位小写十六进制");
    assert.equal(readKeyFile(KEY_FILE_PATH).key, KEY);
  });

  it("key 文件名与内容不一致时拒绝提交", t => {
    const root = workspace(t);
    const path = join(root, "deadbeefdeadbeefdeadbeefdeadbeef.txt");
    writeFileSync(path, "00000000000000000000000000000000\n", "utf8");
    assert.throws(() => readKeyFile(path), /与文件内容一致/);
  });

  it("缺少 key 文件时给出明确错误", () => {
    assert.throws(() => readKeyFile("E:/definitely-missing/indexnow.txt"), /key 文件不存在/);
  });
});

describe("站点来源校验", () => {
  it("接受精确的 https 来源与本地调试来源", () => {
    assert.equal(normalizeOrigin(ORIGIN), ORIGIN);
    assert.equal(normalizeOrigin("http://localhost:3000"), "http://localhost:3000");
  });

  it("拒绝带路径、末尾斜杠、明文 http、凭据或查询串的来源", () => {
    for (const value of [`${ORIGIN}/`, `${ORIGIN}/midis`, "http://lostmidi.dzhes.xyz", "https://user@lostmidi.dzhes.xyz", `${ORIGIN}?a=1`, `${ORIGIN}/#x`, " lostmidi.dzhes.xyz", ""]) {
      assert.equal(normalizeOrigin(value), null, `应拒绝：${value}`);
    }
  });
});

describe("sitemap 解析", () => {
  it("解析 urlset 的 loc 与 lastmod", () => {
    const document = parseSitemap(urlset([[`${ORIGIN}/`, null], [`${ORIGIN}/midis/con-kurage`, "2026-09-27T09:36:39.021Z"]]));
    assert.equal(document.kind, "urlset");
    assert.deepEqual(document.urls, [
      { loc: `${ORIGIN}/`, lastModified: undefined },
      { loc: `${ORIGIN}/midis/con-kurage`, lastModified: "2026-09-27T09:36:39.021Z" },
    ]);
  });

  it("识别分片索引", () => {
    const document = parseSitemap(`<?xml version="1.0"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${ORIGIN}/sitemap/static.xml</loc></sitemap><sitemap><loc>${ORIGIN}/sitemap/midis-0.xml</loc></sitemap></sitemapindex>`);
    assert.deepEqual(document, { kind: "index", locs: [`${ORIGIN}/sitemap/static.xml`, `${ORIGIN}/sitemap/midis-0.xml`] });
  });

  it("解码实体，避免把 &amp; 当成 URL 内容", () => {
    assert.deepEqual(parseSitemap(urlset([[`${ORIGIN}/search?q=a&amp;b=1`, null]])).urls.map(url => url.loc), [`${ORIGIN}/search?q=a&b=1`]);
  });
});

describe("URL 采集", () => {
  it("展开索引分片、去重并保留更晚的 lastmod，丢弃非本站 URL", async () => {
    const fetchImpl = fakeFetch({
      [`${ORIGIN}/sitemap.xml`]: { body: `<?xml version="1.0"?>\n<sitemapindex><sitemap><loc>${ORIGIN}/sitemap/static.xml</loc></sitemap><sitemap><loc>${ORIGIN}/sitemap/midis-0.xml</loc></sitemap></sitemapindex>` },
      [`${ORIGIN}/sitemap/static.xml`]: { body: urlset([[`${ORIGIN}/`, null], [`${ORIGIN}/midis`, "2026-09-01T00:00:00.000Z"]]) },
      [`${ORIGIN}/sitemap/midis-0.xml`]: { body: urlset([[`${ORIGIN}/midis`, "2026-09-29T00:00:00.000Z"], ["https://elsewhere.example/midis/x", null], [`${ORIGIN}/midis/con-origin`, null]]) },
    });
    const collected = await collectSitemapUrls({ sitemapUrl: `${ORIGIN}/sitemap.xml`, origin: ORIGIN, fetchImpl });
    assert.equal(collected.kind, "index");
    assert.equal(collected.shardCount, 2);
    assert.deepEqual(collected.urls, [
      { loc: `${ORIGIN}/`, lastModified: undefined },
      { loc: `${ORIGIN}/midis`, lastModified: "2026-09-29T00:00:00.000Z" },
      { loc: `${ORIGIN}/midis/con-origin`, lastModified: undefined },
    ]);
  });

  it("单文档 sitemap 也能直接采集", async () => {
    const fetchImpl = fakeFetch({ [`${ORIGIN}/sitemap.xml`]: { body: urlset([[`${ORIGIN}/about`, null]]) } });
    const collected = await collectSitemapUrls({ sitemapUrl: `${ORIGIN}/sitemap.xml`, origin: ORIGIN, fetchImpl });
    assert.equal(collected.kind, "urlset");
    assert.equal(collected.urls.length, 1);
  });
});

describe("提交计划", () => {
  const urls = [
    { loc: `${ORIGIN}/`, lastModified: undefined },
    { loc: `${ORIGIN}/midis`, lastModified: "2026-09-29T00:00:00.000Z" },
    { loc: `${ORIGIN}/about`, lastModified: "2026-09-01T00:00:00.000Z" },
  ];

  it("只提交未记录或 lastmod 变化的 URL", () => {
    const state = { [`${ORIGIN}/`]: "", [`${ORIGIN}/midis`]: "2026-09-29T00:00:00.000Z", [`${ORIGIN}/about`]: "2026-08-01T00:00:00.000Z" };
    const { pending, skipped } = planSubmissions({ urls, state });
    assert.deepEqual(pending.map(url => url.loc), [`${ORIGIN}/about`]);
    assert.deepEqual(skipped.map(url => url.loc), [`${ORIGIN}/`, `${ORIGIN}/midis`]);
  });

  it("--all 时忽略状态文件", () => {
    const state = { [`${ORIGIN}/`]: "", [`${ORIGIN}/midis`]: "2026-09-29T00:00:00.000Z" };
    assert.equal(planSubmissions({ urls, state, all: true }).pending.length, 3);
  });

  it("按 10,000 条一批切分", () => {
    const list = Array.from({ length: BATCH_SIZE + 3 }, (_, index) => ({ loc: `${ORIGIN}/p/${index}` }));
    const batches = toBatches(list);
    assert.deepEqual(batches.map(batch => batch.length), [BATCH_SIZE, 3]);
  });

  it("只保留更新时间在窗口内的 URL，缺失 lastmod 的条目保留", () => {
    const filtered = filterSince(urls, new Date("2026-09-15T00:00:00.000Z"));
    assert.deepEqual(filtered.map(url => url.loc), [`${ORIGIN}/`, `${ORIGIN}/midis`]);
    assert.equal(filterSince(urls, null).length, 3);
  });

  it("--since 支持时长与 ISO 日期", () => {
    const now = new Date("2026-10-02T00:00:00.000Z");
    assert.equal(parseSince("26h", now).toISOString(), "2026-09-30T22:00:00.000Z");
    assert.equal(parseSince("7d", now).toISOString(), "2026-09-25T00:00:00.000Z");
    assert.equal(parseSince("2026-09-01", now).toISOString(), "2026-09-01T00:00:00.000Z");
    assert.throws(() => parseSince("yesterday", now), UsageError);
  });

  it("请求体字段与协议一致", () => {
    assert.deepEqual(buildPayload({ host: "lostmidi.dzhes.xyz", key: KEY, keyLocation: KEY_LOCATION, urlList: urls }), {
      host: "lostmidi.dzhes.xyz", key: KEY, keyLocation: KEY_LOCATION,
      urlList: [`${ORIGIN}/`, `${ORIGIN}/midis`, `${ORIGIN}/about`],
    });
  });
});

describe("状态码语义", () => {
  it("按协议表解释 400/403/422/429", () => {
    assert.equal(describeStatus(200), "OK：URL 已提交");
    assert.match(describeStatus(403), /key 无效/);
    assert.match(describeStatus(422), /不属于该 host/);
    assert.match(describeStatus(429), /退避重试/);
    assert.match(describeStatus(400), /格式无效/);
  });

  it("Retry-After 支持秒数与 HTTP 日期", () => {
    assert.equal(retryDelayMs("5", 1), 5000);
    assert.equal(retryDelayMs(undefined, 1), 2000);
    assert.equal(retryDelayMs(undefined, 2), 4000);
    assert.equal(retryDelayMs(undefined, 9), 60_000, "退避有上限");
  });
});

describe("提交请求", () => {
  const payload = buildPayload({ host: "lostmidi.dzhes.xyz", key: KEY, keyLocation: KEY_LOCATION, urlList: [{ loc: `${ORIGIN}/about` }] });

  it("POST JSON 请求体并接受 200", async () => {
    const fetchImpl = fakeFetch({ [ENGINES.indexnow]: { status: 200, body: "" } });
    const result = await submitBatch({ engine: "indexnow", endpoint: ENGINES.indexnow, payload, fetchImpl, sleep: async () => {} });
    assert.equal(result.ok, true);
    assert.equal(fetchImpl.posts()[0].init.headers["content-type"], "application/json; charset=utf-8");
    assert.deepEqual(fetchImpl.posts()[0].body, payload);
  });

  it("429 按 Retry-After 重试后再成功", async () => {
    const waits = [];
    let attempt = 0;
    const fetchImpl = fakeFetch({ [ENGINES.bing]: () => (attempt++ === 0 ? { status: 429, headers: { "retry-after": "3" } } : { status: 200 }) });
    const result = await submitBatch({ engine: "bing", endpoint: ENGINES.bing, payload, fetchImpl, sleep: async wait => waits.push(wait) });
    assert.equal(result.ok, true);
    assert.deepEqual(waits, [3000]);
  });

  it("403 不重试并带出协议原因", async () => {
    const fetchImpl = fakeFetch({ [ENGINES.yandex]: { status: 403, body: "key not found" } });
    const result = await submitBatch({ engine: "yandex", endpoint: ENGINES.yandex, payload, fetchImpl, sleep: async () => {} });
    assert.equal(result.ok, false);
    assert.equal(fetchImpl.calls.length, 1, "永久失败不应重试");
    assert.match(result.detail, /key 无效/);
    assert.match(result.detail, /key not found/);
  });

  it("网络错误在尝试次数内恢复", async () => {
    let attempt = 0;
    const fetchImpl = fakeFetch({ [ENGINES.indexnow]: () => { if (attempt++ === 0) return new Error("socket hang up"); return { status: 200 }; } });
    const result = await submitBatch({ engine: "indexnow", endpoint: ENGINES.indexnow, payload, fetchImpl, attempts: 2, sleep: async () => {} });
    assert.equal(result.ok, true);
    assert.equal(result.attempts, 2);
  });

  it("key 托管校验区分 404、内容不符与 200", async () => {
    assert.equal((await verifyKeyLocation({ keyLocation: KEY_LOCATION, key: KEY, fetchImpl: fakeFetch({ [KEY_LOCATION]: { status: 404 } }) })).ok, false);
    const wrong = await verifyKeyLocation({ keyLocation: KEY_LOCATION, key: KEY, fetchImpl: fakeFetch({ [KEY_LOCATION]: { body: "other-key\n" } }) });
    assert.equal(wrong.ok, false);
    assert.match(wrong.detail, /内容与 key 不一致/);
    assert.equal((await verifyKeyLocation({ keyLocation: KEY_LOCATION, key: KEY, fetchImpl: fakeFetch({ [KEY_LOCATION]: { body: `${KEY}\n` } }) })).ok, true);
  });
});

describe("命令行", () => {
  it("解析列表、数字与开关，并拒绝未知参数", () => {
    const flags = parseArgs(["--url", `${ORIGIN}/a`, "--url", `${ORIGIN}/b`, "--engine", "bing", "--limit", "5", "--dry-run"]);
    assert.deepEqual(flags.url, [`${ORIGIN}/a`, `${ORIGIN}/b`]);
    assert.deepEqual(flags.engine, ["bing"]);
    assert.equal(flags.limit, 5);
    assert.equal(flags.dryRun, true);
    assert.throws(() => parseArgs(["--nope"]), UsageError);
    assert.throws(() => parseArgs(["--limit"]), UsageError);
    assert.throws(() => parseArgs(["--limit", "0"]), UsageError);
  });

  it("URL 里的 = 不会被当成参数分隔符", () => {
    const flags = parseArgs(["--url=https://lostmidi.dzhes.xyz/search?q=a=b"]);
    assert.deepEqual(flags.url, ["https://lostmidi.dzhes.xyz/search?q=a=b"]);
  });
});

describe("端到端", () => {
  const sitemapRoutes = (extra = {}) => ({
    [`${ORIGIN}/sitemap.xml`]: { body: urlset([[`${ORIGIN}/`, null], [`${ORIGIN}/midis/con-kurage`, "2026-09-27T09:36:39.021Z"]]) },
    [KEY_LOCATION]: { body: `${KEY}\n` },
    [ENGINES.indexnow]: { status: 200, body: "" },
    ...extra,
  });

  it("dry-run 只打印批次，不提交也不写状态", async t => {
    const root = workspace(t);
    const { out, fetchImpl, options, text } = runner({ routes: sitemapRoutes(), argv: ["--origin", ORIGIN, "--dry-run"], root });
    const { code, summary } = await run(options);
    assert.equal(code, 0);
    assert.equal(summary.pending, 2);
    assert.equal(fetchImpl.posts().length, 0, "dry-run 不应发送提交请求");
    assert.ok(!existsSync(join(root, "state.json")), "dry-run 不应写状态文件");
    assert.match(text(), /key 托管校验：通过/);
    assert.match(text(), /dry-run 不发送/);
    assert.ok(out.length > 0);
  });

  it("key 文件不可达时以退出码 1 结束，且不提交任何 URL", async t => {
    const root = workspace(t);
    const { fetchImpl, options, text } = runner({ routes: { ...sitemapRoutes(), [KEY_LOCATION]: { status: 404 } }, argv: ["--origin", ORIGIN], root });
    const { code, summary } = await run(options);
    assert.equal(code, 1);
    assert.equal(summary.submitted, 0);
    assert.equal(fetchImpl.posts().length, 0);
    assert.match(text(), /key 托管校验：失败/);
    assert.match(text(), /404/);
  });

  it("提交成功后写状态，重跑只提交变化", async t => {
    const root = workspace(t);
    const routes = sitemapRoutes();
    const first = runner({ routes, argv: ["--origin", ORIGIN], root });
    const firstRun = await run(first.options);
    assert.equal(firstRun.code, 0);
    assert.equal(firstRun.summary.submitted, 2);
    assert.deepEqual(first.fetchImpl.posts()[0].body, {
      host: "lostmidi.dzhes.xyz", key: KEY, keyLocation: KEY_LOCATION,
      urlList: [`${ORIGIN}/`, `${ORIGIN}/midis/con-kurage`],
    });
    assert.match(first.text(), /状态已写入/);

    const second = runner({ routes, argv: ["--origin", ORIGIN], root });
    const secondRun = await run(second.options);
    assert.equal(secondRun.code, 0);
    assert.equal(secondRun.summary.pending, 0);
    assert.equal(secondRun.summary.skipped, 2);
    assert.equal(second.fetchImpl.posts().length, 0, "未变化的 URL 不再提交");

    const third = runner({ routes, argv: ["--origin", ORIGIN, "--all"], root });
    const thirdRun = await run(third.options);
    assert.equal(thirdRun.summary.pending, 2);
  });

  it("--verify-only 只做校验", async t => {
    const root = workspace(t);
    const { fetchImpl, options, text } = runner({ routes: sitemapRoutes(), argv: ["--origin", ORIGIN, "--verify-only"], root });
    const { code } = await run(options);
    assert.equal(code, 0);
    assert.equal(fetchImpl.calls.length, 1, "只请求 key 文件");
    assert.match(text(), /key 托管校验：通过/);
  });

  it("引擎拒绝时以退出码 1 结束且不写状态", async t => {
    const root = workspace(t);
    const { options, text } = runner({ routes: sitemapRoutes({ [ENGINES.indexnow]: { status: 422, body: "urls don't belong to host" } }), argv: ["--origin", ORIGIN], root });
    const { code, summary } = await run(options);
    assert.equal(code, 1);
    assert.equal(summary.submitted, 0);
    assert.ok(!existsSync(join(root, "state.json")));
    assert.match(text(), /422/);
  });

  it("JSON 摘要包含关键字段", async t => {
    const root = workspace(t);
    const { options } = runner({ routes: sitemapRoutes(), argv: ["--origin", ORIGIN, "--dry-run", "--json"], root });
    const { summary } = await run(options);
    assert.equal(summary.origin, ORIGIN);
    assert.equal(summary.keyLocation, KEY_LOCATION);
    assert.deepEqual(summary.engines, ["indexnow"]);
    assert.equal(summary.verified, true);
    assert.equal(summary.dryRun, true);
  });

  it("缺少站点来源时报参数错误", async t => {
    const root = workspace(t);
    const { options } = runner({ routes: sitemapRoutes(), argv: [], root });
    await assert.rejects(() => run(options), UsageError);
  });

  it("--help 返回 0 且不访问网络", async t => {
    const root = workspace(t);
    const { fetchImpl, options, text } = runner({ routes: {}, argv: ["--help"], root });
    const { code } = await run(options);
    assert.equal(code, 0);
    assert.equal(fetchImpl.calls.length, 0);
    assert.match(text(), /IndexNow 推送工具/);
  });
});
