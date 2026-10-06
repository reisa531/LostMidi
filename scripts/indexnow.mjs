#!/usr/bin/env node
// IndexNow 推送工具：托管 key 校验 → 采集 sitemap URL → 按引擎提交。
//
// 教程的两个必需步骤都在这里落地：
//   1) key 文件托管在站点根目录：frontend/public/<key>.txt → https://<host>/<key>.txt，文件内容就是 key。
//   2) 以 POST JSON 提交 urlList；列表超过 10,000 条时自动分批。
//
// 用法：
//   node scripts/indexnow.mjs                     # 校验 key → 采集 sitemap → 只提交有变化的 URL
//   node scripts/indexnow.mjs --dry-run           # 打印将提交的批次，不发送提交请求
//   node scripts/indexnow.mjs --verify-only       # 只校验 key 文件是否已正确托管
//   node scripts/indexnow.mjs --all               # 忽略状态文件，提交全部 URL
//   node scripts/indexnow.mjs --engine bing --engine yandex
//   node scripts/indexnow.mjs --url https://lostmidi.dzhes.xyz/midis/con-kurage
//
// 环境变量：INDEXNOW_ORIGIN / ADMIN_ORIGIN（站点来源）、INDEXNOW_KEY_FILE、INDEXNOW_STATE、
//           INDEXNOW_ENGINES（逗号分隔）、INDEXNOW_TIMEOUT_MS、INDEXNOW_ATTEMPTS。
//
// 退出码：0 成功；1 校验或提交失败；2 参数用法错误。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** 站点根目录托管的 key 文件名即 key 本身（教程 Option 1）。 */
export const KEY_FILE_NAME = "5c270565dbaf403db9534550a63670e3.txt";
/** key 文件必须落在 Next.js 静态根目录，部署后即 https://<host>/<key>.txt。 */
export const KEY_FILE_PATH = fileURLToPath(new URL(`../frontend/public/${KEY_FILE_NAME}`, import.meta.url));
export const DEFAULT_STATE_PATH = ".local/indexnow-state.json";
/** IndexNow 协议单次请求的 URL 上限。 */
export const BATCH_SIZE = 10_000;
/** 接受同一 JSON 请求体的搜索引擎端点。 */
export const ENGINES = {
  indexnow: "https://api.indexnow.org/indexnow",
  bing: "https://www.bing.com/indexnow",
  yandex: "https://yandex.com/indexnow",
  seznam: "https://search.seznam.cz/indexnow",
  naver: "https://searchadvisor.naver.com/indexnow",
};
export const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{7,127}$/;

const DEFAULT_ENGINE = "indexnow";
const MAX_SHARDS = 100;
const MAX_DETAIL = 300;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;

const USAGE = `IndexNow 推送工具

用法：node scripts/indexnow.mjs [选项]

  --url <url>          只提交给定 URL，可重复（与 sitemap 采集互斥）
  --origin <origin>    站点来源，需为精确 https 来源（默认取 INDEXNOW_ORIGIN / ADMIN_ORIGIN）
  --sitemap <url>      改用指定 sitemap，默认 <origin>/sitemap.xml
  --key-file <path>    改用指定 key 文件，默认 frontend/public/${KEY_FILE_NAME}
  --state <path>       状态文件，默认 ${DEFAULT_STATE_PATH}（记录已提交 URL 及其更新时间）
  --engine <name>      提交目标，可重复：${Object.keys(ENGINES).join(" / ")}（默认 ${DEFAULT_ENGINE}）
  --limit <n>          本次最多提交 n 条
  --since <ISO|26h|7d> 只提交 sitemap 中更新时间在此之后的 URL
  --attempts <n>       429/5xx/网络错误的尝试次数，默认 ${DEFAULT_ATTEMPTS}
  --timeout <ms>       单次请求超时，默认 ${DEFAULT_TIMEOUT_MS}
  --all                忽略状态文件，提交全部 URL
  --prune              提交成功后，用当前 URL 集合重写状态文件
  --dry-run            只打印批次内容，不发送提交请求
  --verify-only        只校验 key 文件可达且内容正确
  --no-verify          跳过 key 文件可达性校验
  --json               以 JSON 输出本次结果摘要
  --help               显示本帮助

退出码：0 成功；1 校验或提交失败；2 参数用法错误。`;

/** 参数用法错误，由 run() 转成退出码 2。 */
export class UsageError extends Error {}

const STATUS_TEXT = {
  200: "OK：URL 已提交",
  202: "已接受，等待处理",
  400: "请求格式无效 (Bad request)",
  403: "key 无效：文件不存在，或文件里没有该 key (Forbidden)",
  422: "URL 不属于该 host，或 key 不符合协议 (Unprocessable Entity)",
  429: "请求过多，稍后退避重试 (Too Many Requests)",
};

export function describeStatus(status) {
  return STATUS_TEXT[status] ?? `未预期的状态码 ${status}`;
}

export function isSuccessStatus(status) {
  return status === 200 || status === 202;
}

export function isRetryableStatus(status) {
  return status === 429 || status >= 500;
}

/** 取 Retry-After（秒数或 HTTP 日期），缺失或非法时用指数退避。 */
export function retryDelayMs(value, attempt) {
  const fallback = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
  if (typeof value !== "string" || !value.trim()) return fallback;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return Math.min(Math.max(date.getTime() - Date.now(), 0), MAX_BACKOFF_MS);
}

const XML_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function unescapeXml(value) {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (match, entity) => {
    if (entity.startsWith("#x") || entity.startsWith("#")) {
      const code = Number.parseInt(entity.startsWith("#x") ? entity.slice(2) : entity.slice(1), entity.startsWith("#x") ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

/** 解析 sitemap 文档：索引（分片列表）或 urlset（URL + lastmod）。 */
export function parseSitemap(xml) {
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map(match => unescapeXml(match[1].trim()));
  if (/<sitemapindex[\s>]/.test(xml)) return { kind: "index", locs: locs.filter(Boolean) };
  const urls = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(block => {
    const loc = unescapeXml((block[1].match(/<loc>([\s\S]*?)<\/loc>/) ?? ["", ""])[1].trim());
    const lastModified = unescapeXml((block[1].match(/<lastmod>([\s\S]*?)<\/lastmod>/) ?? ["", ""])[1].trim());
    return { loc, lastModified: lastModified || undefined };
  }).filter(url => url.loc);
  return { kind: "urlset", urls };
}

/** 与 frontend/src/lib/install/config.ts 的 browserOrigin 同规则：精确公开来源，无路径、无末尾斜杠。 */
export function normalizeOrigin(value) {
  try {
    if (typeof value !== "string" || !value || value !== value.trim()) return null;
    if (/[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
    if (!/^https?:\/\//i.test(value)) return null;
    const url = new URL(value);
    if (!url.hostname || url.username || url.password || url.search || url.hash) return null;
    if (value !== url.origin) return null;
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || local ? url.origin : null;
  } catch {
    return null;
  }
}

function isoTimestamp(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/** 合并同一 loc 的两条记录，优先保留更晚的 lastmod。 */
function mergeUrl(map, url) {
  const known = map.get(url.loc);
  if (!known) return void map.set(url.loc, url);
  const incoming = isoTimestamp(url.lastModified);
  const existing = isoTimestamp(known.lastModified);
  map.set(url.loc, { loc: url.loc, lastModified: incoming && (!existing || incoming > existing) ? url.lastModified : known.lastModified });
}

/** 采集 origin 下的全部 URL；/sitemap.xml 是分片索引时逐片展开，丢弃非本站 URL。 */
export async function collectSitemapUrls({ sitemapUrl, origin, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const root = parseSitemap(await fetchText(sitemapUrl, { fetchImpl, timeoutMs }));
  const documents = root.kind === "index"
    ? await Promise.all(root.locs.slice(0, MAX_SHARDS).map(async shard =>
      parseSitemap(await fetchText(shard, { fetchImpl, timeoutMs }))))
    : [root];
  const collected = new Map();
  for (const document of documents) for (const url of document.urls ?? []) mergeUrl(collected, url);
  const urls = [...collected.values()].filter(url => {
    try { return !origin || new URL(url.loc).origin === origin; } catch { return false; }
  });
  return { kind: root.kind, shardCount: root.kind === "index" ? root.locs.length : 1, urls };
}

export async function fetchText(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`GET ${url} 失败：HTTP ${response.status}`);
  return response.text();
}

/** 只保留 sitemap 更新时间在 since 之后的 URL；缺 lastmod 的条目按“无法证明过期”保留。 */
export function filterSince(urls, since) {
  const threshold = since instanceof Date ? since.getTime() : Number.NaN;
  if (!Number.isFinite(threshold)) return urls;
  return urls.filter(url => {
    const modified = isoTimestamp(url.lastModified);
    return modified === undefined || Date.parse(modified) >= threshold;
  });
}

/** 与状态文件比对，得出本次需要提交的 URL。 */
export function planSubmissions({ urls, state = {}, all = false }) {
  const pending = [];
  const skipped = [];
  for (const url of urls) {
    const known = Object.hasOwn(state, url.loc) ? state[url.loc] : undefined;
    const unchanged = !all && known !== undefined && known === (url.lastModified ?? "");
    (unchanged ? skipped : pending).push(url);
  }
  return { pending, skipped };
}

export function toBatches(list, size = BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < list.length; index += size) batches.push(list.slice(index, index + size));
  return batches;
}

export function buildPayload({ host, key, keyLocation, urlList }) {
  return { host, key, keyLocation, urlList: urlList.map(url => url.loc) };
}

function truncate(value) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > MAX_DETAIL ? `${text.slice(0, MAX_DETAIL)}…` : text;
}

async function errorDetail(response) {
  try {
    const body = truncate(await response.text());
    return body ? `${describeStatus(response.status)}｜响应：${body}` : describeStatus(response.status);
  } catch {
    return describeStatus(response.status);
  }
}

/** 向一个引擎提交一批 URL；429/5xx/网络错误按 Retry-After 或指数退避重试。 */
export async function submitBatch({
  engine, endpoint, payload, fetchImpl = fetch, attempts = DEFAULT_ATTEMPTS,
  timeoutMs = DEFAULT_TIMEOUT_MS, sleep = defaultSleep, onRetry = () => {},
}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const detail = `网络错误：${truncate(error?.message ?? error)}`;
      if (attempt === attempts) return { engine, ok: false, status: 0, attempts: attempt, detail };
      const wait = retryDelayMs(undefined, attempt);
      onRetry({ engine, attempt, status: 0, wait });
      await sleep(wait);
      continue;
    }
    if (isSuccessStatus(response.status)) {
      return { engine, ok: true, status: response.status, attempts: attempt, detail: describeStatus(response.status) };
    }
    if (isRetryableStatus(response.status) && attempt < attempts) {
      const wait = retryDelayMs(response.headers?.get?.("retry-after"), attempt);
      onRetry({ engine, attempt, status: response.status, wait });
      await sleep(wait);
      continue;
    }
    return { engine, ok: false, status: response.status, attempts: attempt, detail: await errorDetail(response) };
  }
  return { engine, ok: false, status: 0, attempts, detail: "重试次数已用尽" };
}

/** 校验 key 文件确实托管在 keyLocation，且文件内容包含 key（对应协议 403 的判定）。 */
export async function verifyKeyLocation({ keyLocation, key, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  let response;
  try {
    response = await fetchImpl(keyLocation, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return { ok: false, status: 0, detail: `无法访问 ${keyLocation}：${truncate(error?.message ?? error)}` };
  }
  if (response.status !== 200) {
    const hint = response.status === 404 ? "：key 文件尚未部署到站点根目录" : "";
    return { ok: false, status: response.status, detail: `GET ${keyLocation} 返回 HTTP ${response.status}${hint}` };
  }
  const body = (await response.text()).trim();
  if (body !== key) {
    return { ok: false, status: 200, detail: `key 文件内容与 key 不一致，文件内应只包含 ${key}，当前为「${truncate(body)}」` };
  }
  return { ok: true, status: 200, detail: `${keyLocation} 已托管且内容正确`, body };
}

export function readKeyFile(path) {
  if (!existsSync(path)) throw new Error(`key 文件不存在：${path}（应位于 frontend/public/<key>.txt）`);
  const content = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  const body = content.trim();
  if (!KEY_PATTERN.test(body)) throw new Error(`key 文件内容不是合法 IndexNow key：${path}`);
  if (body !== basename(path, ".txt")) throw new Error(`key 文件名必须与文件内容一致：${basename(path)} 内含 ${body}`);
  return { key: body, fileName: basename(path), content };
}

export function parseSince(value, now = new Date()) {
  const match = /^(\d+)([smhd])$/.exec(value);
  if (match) {
    const factor = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]];
    return new Date(now.getTime() - Number(match[1]) * factor);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new UsageError(`--since 需要 ISO 日期或 26h / 7d 形式：${value}`);
  return date;
}

const ARG_SPEC = {
  "--url": { kind: "list" },
  "--origin": { kind: "value" },
  "--sitemap": { kind: "value" },
  "--key-file": { kind: "value" },
  "--state": { kind: "value" },
  "--engine": { kind: "list" },
  "--limit": { kind: "number" },
  "--timeout": { kind: "number" },
  "--attempts": { kind: "number" },
  "--since": { kind: "value" },
  "--all": { kind: "flag" },
  "--prune": { kind: "flag" },
  "--dry-run": { kind: "flag" },
  "--verify-only": { kind: "flag" },
  "--no-verify": { kind: "flag" },
  "--json": { kind: "flag" },
  "--help": { kind: "flag" },
};

const camel = name => name.replace(/^--/, "").replace(/-([a-z])/g, (_, character) => character.toUpperCase());

export function parseArgs(argv) {
  const flags = { url: [], engine: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    // 只在 `--flag=value` 形态上切分：URL 自身可能带查询串的 `=`。
    const split = token.startsWith("--") ? token.indexOf("=") : -1;
    const [name, inline] = split > 0 ? [token.slice(0, split), token.slice(split + 1)] : [token, undefined];
    const spec = ARG_SPEC[name];
    if (!spec) throw new UsageError(`未知参数：${token}`);
    if (spec.kind === "flag") {
      if (inline !== undefined) throw new UsageError(`${name} 不接受取值`);
      flags[camel(name)] = true;
      continue;
    }
    const value = inline ?? argv[++index];
    if (value === undefined) throw new UsageError(`${name} 缺少取值`);
    if (spec.kind === "number") {
      const number = Number(value);
      if (!Number.isFinite(number) || number <= 0) throw new UsageError(`${name} 需要正数：${value}`);
      flags[camel(name)] = Math.floor(number);
      continue;
    }
    if (spec.kind === "list") flags[camel(name)].push(value);
    else flags[camel(name)] = value;
  }
  return flags;
}

function defaultSleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function readState(path) {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return parsed && typeof parsed.urls === "object" && parsed.urls ? parsed.urls : {};
  } catch {
    return {};
  }
}

function writeState(path, { origin, urls }) {
  const absolute = resolve(path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify({ updatedAt: new Date().toISOString(), origin, urls }, null, 2)}\n`, "utf8");
  return absolute;
}

/** 完整流程；返回 { code, summary }，由 main() 决定 process.exitCode。 */
export async function run({
  argv = [], env = process.env, fetchImpl = fetch, stdout = console.log, stderr = console.error,
  now = () => new Date(), sleep = defaultSleep,
} = {}) {
  const flags = parseArgs(argv);
  if (flags.help) {
    stdout(USAGE);
    return { code: 0, summary: { help: true } };
  }
  const engines = flags.engine.length ? flags.engine : (env.INDEXNOW_ENGINES ? env.INDEXNOW_ENGINES.split(",").map(value => value.trim()).filter(Boolean) : [DEFAULT_ENGINE]);
  for (const engine of engines) if (!Object.hasOwn(ENGINES, engine)) throw new UsageError(`未知引擎：${engine}（可用：${Object.keys(ENGINES).join(" / ")}）`);

  const keyPath = flags.keyFile ?? env.INDEXNOW_KEY_FILE ?? KEY_FILE_PATH;
  const { key, fileName } = readKeyFile(keyPath);
  const statePath = flags.state ?? env.INDEXNOW_STATE ?? DEFAULT_STATE_PATH;
  const timeoutMs = flags.timeout ?? (Number(env.INDEXNOW_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const attempts = flags.attempts ?? (Number(env.INDEXNOW_ATTEMPTS) || DEFAULT_ATTEMPTS);

  let origin = normalizeOrigin(flags.origin ?? env.INDEXNOW_ORIGIN ?? env.ADMIN_ORIGIN ?? "");
  if ((flags.origin || env.INDEXNOW_ORIGIN || env.ADMIN_ORIGIN) && !origin) throw new UsageError("站点来源必须是精确的 https 来源（无路径、无末尾斜杠）");

  // 只做托管校验时不需要 sitemap：省一次全量采集。
  if (flags.verifyOnly) {
    if (!origin) throw new UsageError("--verify-only 需要站点来源：提供 --origin 或设置 ADMIN_ORIGIN");
    const target = `${origin}/${fileName}`;
    stdout(`[IndexNow] key：${key}（文件 ${keyPath}）`);
    stdout(`[IndexNow] keyLocation：${target}`);
    const verification = await verifyKeyLocation({ keyLocation: target, key, fetchImpl, timeoutMs });
    stdout(`[IndexNow] key 托管校验：${verification.ok ? "通过" : "失败"}｜${verification.detail}`);
    return { code: verification.ok ? 0 : 1, summary: { origin, keyLocation: target, verified: verification.ok, detail: verification.detail, submitted: 0, failed: 0 } };
  }

  let urls = [];
  let sitemapInfo = null;
  if (flags.url.length) {
    urls = flags.url.map(loc => ({ loc, lastModified: undefined }));
  } else {
    const sitemapUrl = flags.sitemap ?? (origin ? `${origin}/sitemap.xml` : "");
    if (!sitemapUrl) throw new UsageError("缺少站点来源：提供 --origin、--sitemap 或设置 ADMIN_ORIGIN");
    const collected = await collectSitemapUrls({ sitemapUrl, origin, fetchImpl, timeoutMs });
    sitemapInfo = { url: sitemapUrl, kind: collected.kind, shardCount: collected.shardCount };
    stdout(`[IndexNow] sitemap：${sitemapUrl} → ${collected.kind === "index" ? `索引 ${collected.shardCount} 片` : `${collected.urls.length} 条 URL`}`);
    urls = collected.urls;
  }
  if (!origin && urls[0]) origin = normalizeOrigin(new URL(urls[0].loc).origin);
  if (!origin) throw new UsageError("无法确定站点来源：提供 --origin，或确认 sitemap 里有属于公开站点的 URL");
  const host = new URL(origin).host;
  const keyLocation = `${origin}/${fileName}`;

  stdout(`[IndexNow] key：${key}（文件 ${keyPath}）`);
  stdout(`[IndexNow] 站点来源：${origin}；keyLocation：${keyLocation}`);

  let verification = { ok: true, status: 0, detail: "已跳过（--no-verify）" };
  if (!flags.noVerify) {
    verification = await verifyKeyLocation({ keyLocation, key, fetchImpl, timeoutMs });
    stdout(`[IndexNow] key 托管校验：${verification.ok ? "通过" : "失败"}｜${verification.detail}`);
  }
  if (!verification.ok) {
    stderr("[IndexNow] 已中止提交：key 文件未正确托管（IndexNow 会异步校验失败，或直接返回 403）。");
    return { code: 1, summary: { origin, keyLocation, verified: false, detail: verification.detail, submitted: 0, failed: 0 } };
  }

  const since = flags.since ? parseSince(flags.since, now()) : null;
  if (since) urls = filterSince(urls, since);
  const state = flags.all ? {} : readState(statePath);
  const { pending: allPending, skipped } = planSubmissions({ urls, state, all: flags.all });
  const pending = flags.limit ? allPending.slice(0, flags.limit) : allPending;
  const batches = toBatches(pending, BATCH_SIZE);
  stdout(`[IndexNow] URL ${urls.length} 条：待提交 ${pending.length} 条，跳过 ${skipped.length} 条${flags.all ? "（--all 忽略状态）" : `（状态 ${statePath}）`}`);

  const submitted = [];
  const failures = [];
  for (const [index, batch] of batches.entries()) {
    const payload = buildPayload({ host, key, keyLocation, urlList: batch });
    if (flags.dryRun) {
      stdout(`[IndexNow] 批次 ${index + 1}/${batches.length}（${batch.length} 条，dry-run 不发送）：`);
      stdout(JSON.stringify({ ...payload, urlList: batch.map(url => url.loc) }, null, 2));
      continue;
    }
    const results = [];
    for (const engine of engines) {
      const result = await submitBatch({
        engine, endpoint: ENGINES[engine], payload, fetchImpl, attempts, timeoutMs, sleep,
        onRetry: ({ attempt, status, wait }) => stdout(`[IndexNow] ${engine} 批次 ${index + 1} 第 ${attempt} 次失败（HTTP ${status || "网络错误"}），${Math.round(wait / 1000)}s 后重试`),
      });
      stdout(`[IndexNow] ${engine} 批次 ${index + 1}/${batches.length}（${batch.length} 条）→ HTTP ${result.status}：${result.detail}`);
      results.push(result);
    }
    if (results.every(result => result.ok)) submitted.push(...batch);
    else failures.push({ batch: index + 1, results });
  }

  if (!flags.dryRun && submitted.length) {
    const next = { ...(flags.prune ? {} : state) };
    for (const url of submitted) next[url.loc] = url.lastModified ?? "";
    const written = writeState(statePath, { origin, urls: next });
    stdout(`[IndexNow] 状态已写入：${written}（累计 ${Object.keys(next).length} 条）`);
  }

  const code = failures.length ? 1 : 0;
  const summary = {
    origin, host, keyLocation, sitemap: sitemapInfo, verified: verification.ok,
    engines, total: urls.length, pending: pending.length, skipped: skipped.length,
    submitted: submitted.length, failed: failures.reduce((sum, failure) => sum + failure.results.filter(result => !result.ok).length, 0),
    dryRun: Boolean(flags.dryRun), failures,
  };
  if (flags.json) stdout(JSON.stringify(summary, null, 2));
  else if (flags.dryRun) stdout(`[IndexNow] dry-run 结束：计划提交 ${pending.length} 条 × ${engines.length} 个引擎`);
  else stdout(`[IndexNow] 完成：${submitted.length}/${pending.length} 提交成功，${failures.length} 批失败`);
  return { code, summary };
}

async function main() {
  try {
    const { code } = await run({ argv: process.argv.slice(2) });
    process.exitCode = code;
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`参数错误：${error.message}\n\n${USAGE}`);
      process.exitCode = 2;
      return;
    }
    console.error(`IndexNow 失败：${error?.message ?? error}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
