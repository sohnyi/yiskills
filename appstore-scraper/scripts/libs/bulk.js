'use strict';

/**
 * lib/bulk.js — 批量评论抓取
 *
 * 通过 recent + helpful 双排序最大化评论覆盖量：
 *   - 每种排序最多 10 页 × ~50 条 = 500 条
 *   - 两种合并去重后通常可获得 600–900 条唯一有内容评论
 *   - 默认返回上限 1000 条，按时间倒序排列
 *
 * 设计原则：
 *   - 翻页之间强制间隔（delay），避免触发 Apple 限速
 *   - 两种排序之间等待 2× delay
 *   - 过滤 text 少于 5 个字符的无效条目（表情 / 空白）
 */

const { sleep, log }  = require('./request');
const { SORT }        = require('./constants');
const { apiReviews }  = require('./store');

/**
 * 抓取单种排序的所有分页。
 *
 * @param {{ id?, appId?, country, sort, maxPages, delay }} opts
 * @returns {Promise<object[]>} 所有页评论的扁平数组
 */
async function fetchReviewPages ({ id, appId, country, sort, maxPages, delay }) {
  const label   = sort === SORT.HELPFUL ? 'helpful' : 'recent';
  const results = [];

  for (let page = 1; page <= maxPages; page++) {
    log(`  [${label}] page ${page}/${maxPages}...`);
    const batch = await apiReviews({ id, appId, country, sort, page });
    results.push(...batch);
    if (!batch.length) {
      log(`  [${label}] empty page, stopping early.`);
      break;
    }
    if (page < maxPages) await sleep(delay);
  }

  return results;
}

/**
 * 双排序批量抓取，返回去重 + 过滤后的有内容评论。
 *
 * @param {{ id?, appId?, country?, target?, delay? }} opts
 * @returns {Promise<object[]>}
 */
async function apiBulkReviews (opts) {
  const country = opts.country || 'us';
  const target  = opts.target  || 1000;
  const delay   = opts.delay   || 800;

  log(`[bulk-reviews] target=${target}, country=${country}, delay=${delay}ms`);

  log('[bulk-reviews] Pass 1/2 — recent');
  const recent = await fetchReviewPages({ id: opts.id, appId: opts.appId, country, sort: SORT.RECENT,  maxPages: 10, delay });

  await sleep(delay * 2); // 两种排序之间多等一下

  log('[bulk-reviews] Pass 2/2 — helpful');
  const helpful = await fetchReviewPages({ id: opts.id, appId: opts.appId, country, sort: SORT.HELPFUL, maxPages: 10, delay });

  // 合并 → 按 id 去重 → 过滤无实质内容 → 按时间倒序 → 截取目标数量
  const seen   = new Set();
  const merged = [];
  for (const r of [...recent, ...helpful]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    const text = (r.text || '').trim();
    if (text.length < 5) continue;
    merged.push({
      id      : r.id,
      score   : r.score,
      title   : (r.title || '').trim(),
      text,
      version : r.version,
      updated : r.updated,
      userName: r.userName,
    });
  }
  merged.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  const final = merged.slice(0, target);

  log(`[bulk-reviews] Done: recent=${recent.length}, helpful=${helpful.length}, unique+filtered=${merged.length}, returned=${final.length}`);
  return final;
}

module.exports = { fetchReviewPages, apiBulkReviews };