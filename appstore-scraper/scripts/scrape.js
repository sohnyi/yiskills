#!/usr/bin/env node
/**
 * scrape.js — App Store 数据抓取 CLI 入口
 *
 * 零外部依赖，仅使用 Node.js 内置模块。
 * 运行环境要求：Node.js >= 12
 *   Node 18+  → 使用原生 fetch
 *   Node 12–17 → 自动启用 https/http 模块实现的 fetch polyfill
 *
 * 用法：node scrape.js <command> [options]
 *
 * Commands:
 *   search          --term <keyword> [--num 10] [--country us] [--page 1]
 *   app             --id <trackId> | --appId <bundleId> [--country us]
 *   ratings         --id <trackId> | --appId <bundleId> [--country us]
 *   reviews         --id <trackId> | --appId <bundleId> [--pages 1] [--sort recent|helpful] [--country us] [--delay 800]
 *   bulk-reviews    --id <trackId> | --appId <bundleId> [--target 1000] [--country us] [--delay 800]
 *   list            --collection <name> [--category <name|id>] [--num 50] [--country us]
 *   developer       --devId <id> [--country us]
 *   similar         --id <trackId> | --appId <bundleId> [--country us]
 *   suggest         --term <keyword> [--country us]
 *   version-history --id <trackId> [--country us]
 *
 * 输出：JSON → stdout；进度/错误 → stderr；出错时 exit code = 1。
 */

'use strict';

// lib/request.js 在 require 时自动完成：
//   ① Node 版本检查（< 12 直接退出）
//   ② AbortController polyfill（Node 12–14）
//   ③ fetch polyfill（Node 12–17，使用内置 https/http）
const { SORT, COLLECTION, CATEGORY } = require('./lib/constants');
const { slimApp }                    = require('./lib/normalize');
const {
  apiApp, apiRatings, apiSearch, apiReviews,
  apiList, apiDeveloper, apiSimilar, apiSuggest, apiVersionHistory,
}                                    = require('./lib/store');
const { apiBulkReviews, fetchReviewPages } = require('./lib/bulk');

// ── 参数解析 ──────────────────────────────────────────────────────────────────

function parseArgs (argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith('--')) {
      args[key.slice(2)] = (argv[i + 1] && !argv[i + 1].startsWith('--'))
        ? argv[++i] : true;
    }
  }
  return args;
}

function resolveCollection (name) {
  if (!name) return COLLECTION.TOP_FREE_IOS;
  return COLLECTION[name.toUpperCase()] || name;
}

function resolveCategory (cat) {
  if (!cat) return undefined;
  const n = parseInt(cat);
  return isNaN(n) ? (CATEGORY[cat.toUpperCase()] || undefined) : n;
}

// ── 命令实现 ──────────────────────────────────────────────────────────────────

async function cmdSearch (a) {
  const r = await apiSearch({ term: a.term, num: +a.num || 10, page: +a.page || 1, country: a.country, lang: a.lang });
  return r.map(slimApp);
}

async function cmdApp (a) {
  if (!a.id && !a.appId) throw new Error('--id or --appId is required');
  return apiApp({ id: a.id, appId: a.appId, country: a.country || 'us', ratings: true });
}

async function cmdRatings (a) {
  if (!a.id && !a.appId) throw new Error('--id or --appId is required');
  return apiRatings({ id: a.id, appId: a.appId, country: a.country || 'us' });
}

async function cmdReviews (a) {
  if (!a.id && !a.appId) throw new Error('--id or --appId is required');
  const sort     = (a.sort || 'recent').toLowerCase() === 'helpful' ? SORT.HELPFUL : SORT.RECENT;
  const maxPages = Math.min(+(a.pages || 1), 10);
  const delay    = +(a.delay || 800);
  return fetchReviewPages({ id: a.id, appId: a.appId, country: a.country || 'us', sort, maxPages, delay });
}

async function cmdBulkReviews (a) {
  if (!a.id && !a.appId) throw new Error('--id or --appId is required');
  return apiBulkReviews({ id: a.id, appId: a.appId, country: a.country || 'us', target: +(a.target || 1000), delay: +(a.delay || 800) });
}

async function cmdList (a) {
  const r = await apiList({ collection: resolveCollection(a.collection), category: resolveCategory(a.category), num: +(a.num || 50), country: a.country || 'us', fullDetail: a.fullDetail === 'true' });
  return r.map(slimApp);
}

async function cmdDeveloper (a) {
  if (!a.devId) throw new Error('--devId is required');
  const r = await apiDeveloper({ devId: a.devId, country: a.country || 'us' });
  return r.map(slimApp);
}

async function cmdSimilar (a) {
  if (!a.id && !a.appId) throw new Error('--id or --appId is required');
  const r = await apiSimilar({ id: a.id, appId: a.appId, country: a.country || 'us' });
  return r.map(slimApp);
}

async function cmdSuggest (a) {
  if (!a.term) throw new Error('--term is required');
  return apiSuggest({ term: a.term, country: a.country });
}

async function cmdVersionHistory (a) {
  if (!a.id) throw new Error('--id (numeric trackId) is required');
  return apiVersionHistory({ id: a.id, country: a.country || 'US' });
}

// ── 路由表 ────────────────────────────────────────────────────────────────────

const COMMANDS = {
  'search'          : cmdSearch,
  'app'             : cmdApp,
  'ratings'         : cmdRatings,
  'reviews'         : cmdReviews,
  'bulk-reviews'    : cmdBulkReviews,
  'list'            : cmdList,
  'developer'       : cmdDeveloper,
  'similar'         : cmdSimilar,
  'suggest'         : cmdSuggest,
  'version-history' : cmdVersionHistory,
};

// ── 主入口 ────────────────────────────────────────────────────────────────────

async function main () {
  const [,, command, ...rest] = process.argv;
  if (!command || !COMMANDS[command]) {
    process.stderr.write('Usage: node scrape.js <' + Object.keys(COMMANDS).join('|') + '> [options]\n');
    process.exit(1);
  }
  const result = await COMMANDS[command](parseArgs(rest));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err) => {
  process.stderr.write('Error: ' + err.message + '\n');
  process.exit(1);
});