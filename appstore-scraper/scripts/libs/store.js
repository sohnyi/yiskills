'use strict';

/**
 * lib/store.js — Apple App Store API 方法
 *
 * 每个函数对应一种数据获取能力，接受 opts 对象，返回 Promise。
 * 不包含 CLI 参数解析逻辑；不包含 bulk-reviews 聚合逻辑（见 bulk.js）。
 */

const { request }                = require('./request');
const { storeId, SORT, COLLECTION } = require('./constants');
const { cleanApp, slimApp, lookup }  = require('./normalize');

// ── 应用详情 ──────────────────────────────────────────────────────────────────

/**
 * 获取单个应用的完整详情。
 * @param {{ id?, appId?, country?, lang?, ratings? }} opts
 */
async function apiApp (opts) {
  const { id, appId, country = 'us', lang } = opts;
  if (!id && !appId) throw new Error('id or appId is required');

  const results = await lookup([id || appId], id ? 'id' : 'bundleId', country, lang);
  if (!results.length) throw new Error('App not found');

  let result = results[0];
  if (opts.ratings) {
    const r = await apiRatings({ id: result.id, country });
    result   = Object.assign({}, result, r);
  }
  return result;
}

// ── 评分分布 ──────────────────────────────────────────────────────────────────

/**
 * 获取评分分布直方图。
 * 通过解析 iTunes 评分页面 HTML 提取数据（无需 cheerio）。
 * @param {{ id?, appId?, country? }} opts
 */
async function apiRatings (opts) {
  const { id, appId, country = 'us' } = opts;

  let numId = id;
  if (!numId) {
    const res = await lookup([appId], 'bundleId', country);
    if (!res.length) throw new Error('App not found');
    numId = res[0].id;
  }

  const url  = `https://itunes.apple.com/${country}/customer-reviews/id${numId}?displayable-kind=11`;
  const html = await request(url, { 'X-Apple-Store-Front': `${storeId(country)},12` });

  // 总评分数
  const countMatch = html.match(/class="rating-count[^"]*"[^>]*>\s*([\d,]+)/);
  const ratings    = countMatch ? parseInt(countMatch[1].replace(/,/g, '')) : 0;

  // 各星级数量（5 → 1 降序排列）
  const starMatches = [...html.matchAll(/class="vote[^"]*"[\s\S]*?class="total[^"]*"[^>]*>\s*(\d+)/g)];
  const histogram   = {};
  starMatches.forEach((m, i) => { histogram[5 - i] = parseInt(m[1]); });

  return { ratings, histogram };
}

// ── 搜索 ──────────────────────────────────────────────────────────────────────

/**
 * 按关键词搜索应用。
 *
 * 注意：Apple 一次返回全部结果，page 参数是内存侧切片。
 * @param {{ term, num?, page?, country?, lang?, idsOnly? }} opts
 */
async function apiSearch (opts) {
  const { term, num = 50, page = 1, country = 'us', lang = 'en-us', idsOnly = false } = opts;
  if (!term) throw new Error('term is required');

  const url  = `https://search.itunes.apple.com/WebObjects/MZStore.woa/wa/search?clientApplication=Software&media=software&term=${encodeURIComponent(term)}`;
  const body = await request(url, {
    'X-Apple-Store-Front': `${storeId(country)},24 t:native`,
    'Accept-Language'    : lang,
  });

  const allResults = (() => {
    const data = JSON.parse(body);
    return (data.bubbles && data.bubbles[0] && data.bubbles[0].results) || [];
  })();

  const pageStart = num * (page - 1);
  if (pageStart > 0 && pageStart >= allResults.length) {
    throw new Error(`Page ${page} out of range: only ${allResults.length} results available`);
  }
  const ids = allResults.slice(pageStart, pageStart + num).map((r) => r.id);

  if (idsOnly) return ids;
  return lookup(ids, 'id', country, lang);
}

// ── 评论 ──────────────────────────────────────────────────────────────────────

/**
 * 获取单页用户评论（最多 10 页，每页约 50 条）。
 * @param {{ id?, appId?, country?, sort?, page? }} opts
 */
async function apiReviews (opts) {
  const { id, appId, country = 'us', sort = SORT.RECENT, page = 1 } = opts;

  let numId = id;
  if (!numId) {
    const res = await lookup([appId], 'bundleId', country);
    if (!res.length) throw new Error('App not found');
    numId = res[0].id;
  }

  const url  = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${numId}/sortby=${sort}/json`;
  const body = await request(url);
  const data = JSON.parse(body);
  const entries = data.feed && data.feed.entry;
  if (!entries) return [];

  const arr = Array.isArray(entries) ? entries : [entries];
  return arr.map((r) => ({
    id      : r.id.label,
    userName: r.author.name.label,
    userUrl : r.author.uri.label,
    version : r['im:version'].label,
    score   : parseInt(r['im:rating'].label),
    title   : r.title.label,
    text    : r.content.label,
    url     : r.link.attributes.href,
    updated : r.updated.label,
  }));
}

// ── 榜单 ──────────────────────────────────────────────────────────────────────

/**
 * 获取 App Store 榜单（免费/付费/畅销/新上架等）。
 * @param {{ collection?, category?, num?, country?, lang?, fullDetail? }} opts
 */
async function apiList (opts) {
  const { collection = COLLECTION.TOP_FREE_IOS, category, num = 50, country = 'us', lang, fullDetail = false } = opts;
  if (num > 200) throw new Error('Cannot retrieve more than 200 apps');

  const catSegment = category ? `/genre=${category}` : '';
  const url  = `https://ax.itunes.apple.com/WebObjects/MZStoreServices.woa/ws/RSS/${collection}/${catSegment}/limit=${num}/json?s=${storeId(country)}`;
  const body = await request(url);
  const data = JSON.parse(body);
  const entries = data.feed.entry;

  if (fullDetail) {
    const ids = entries.map((a) => a.id.attributes['im:id']);
    return lookup(ids, 'id', country, lang);
  }

  return entries.map((a) => {
    let developerUrl, developerId;
    if (a['im:artist'].attributes) {
      developerUrl = a['im:artist'].attributes.href;
      if (developerUrl && developerUrl.includes('/id')) {
        developerId = developerUrl.split('/id')[1].split('?mt')[0];
      }
    }
    const price = parseFloat(a['im:price'].attributes.amount);
    const links = a.link ? (Array.isArray(a.link) ? a.link : [a.link]) : [];
    const altLink = links.find((l) => l.attributes.rel === 'alternate');
    return {
      id         : a.id.attributes['im:id'],
      appId      : a.id.attributes['im:bundleId'],
      title      : a['im:name'].label,
      icon       : a['im:image'][a['im:image'].length - 1].label,
      url        : altLink ? altLink.attributes.href : undefined,
      price, currency: a['im:price'].attributes.currency, free: price === 0,
      description: a.summary ? a.summary.label : undefined,
      developer  : a['im:artist'].label, developerUrl, developerId,
      genre      : a.category.attributes.label,
      genreId    : a.category.attributes['im:id'],
      released   : a['im:releaseDate'].label,
    };
  });
}

// ── 开发者 ────────────────────────────────────────────────────────────────────

/**
 * 获取某开发者在 App Store 上架的全部应用。
 * @param {{ devId, country?, lang? }} opts
 */
async function apiDeveloper (opts) {
  const { devId, country = 'us', lang } = opts;
  if (!devId) throw new Error('devId is required');
  const results = await lookup([devId], 'id', country, lang);
  if (!results.length) throw new Error('Developer not found');
  return results;
}

// ── 相似应用 ──────────────────────────────────────────────────────────────────

/**
 * 获取"用户还购买了"相似应用列表。
 * @param {{ id?, appId?, country?, lang? }} opts
 */
async function apiSimilar (opts) {
  const { id, appId, country = 'us', lang } = opts;
  let numId = id;
  if (!numId) {
    const res = await lookup([appId], 'bundleId', country);
    if (!res.length) throw new Error('App not found');
    numId = res[0].id;
  }

  const html  = await request(`https://itunes.apple.com/us/app/app/id${numId}`, { 'X-Apple-Store-Front': `${storeId(country)},32` });
  const match = /customersAlsoBoughtApps":(.*?\])/g.exec(html);
  if (!match) return [];
  return lookup(JSON.parse(match[1]), 'id', country, lang);
}

// ── 搜索建议 ──────────────────────────────────────────────────────────────────

/**
 * 获取搜索关键词补全建议（Apple 搜索框自动完成数据）。
 * @param {{ term, country? }} opts
 */
async function apiSuggest (opts) {
  const { term, country } = opts;
  if (!term) throw new Error('term is required');

  const url = `https://search.itunes.apple.com/WebObjects/MZSearchHints.woa/wa/hints?clientApplication=Software&term=${encodeURIComponent(term)}`;
  const xml = await request(url, { 'X-Apple-Store-Front': `${storeId(country)},29` });

  // 解析 Apple plist XML，提取 term 字段（无需 xml2js）
  const terms   = [];
  const dictRe  = /<dict>([\s\S]*?)<\/dict>/g;
  let m;
  while ((m = dictRe.exec(xml)) !== null) {
    const block = m[1];
    if (/<key>\s*term\s*<\/key>/.test(block)) {
      const s = block.match(/<string>([\s\S]*?)<\/string>/);
      if (s) terms.push({ term: s[1].trim() });
    }
  }
  return terms;
}

// ── 版本历史 ──────────────────────────────────────────────────────────────────

/**
 * 获取应用版本发布历史。
 * 通过解析 App Store 网页提取 JWT，再调用 AMP API。
 * @param {{ id, country? }} opts
 */
async function apiVersionHistory (opts) {
  const { id, country = 'US' } = opts;
  if (!id) throw new Error('id (numeric trackId) is required');

  // 1. 从 App Store 网页提取 Bearer token
  const html       = await request(`https://apps.apple.com/${country}/app/id${id}`);
  const tokenMatch = /token%22%3A%22([^%]+)%22%7D/.exec(html);
  if (!tokenMatch) throw new Error('Could not extract API token from App Store page');

  // 2. 用 token 调用 AMP API 获取版本历史
  const apiUrl = `https://amp-api-edge.apps.apple.com/v1/catalog/${country}/apps/${id}?platform=web&extend=versionHistory&additionalPlatforms=appletv,ipad,iphone,mac,realityDevice`;
  const json   = await request(apiUrl, {
    Origin       : 'https://apps.apple.com',
    Authorization: `Bearer ${tokenMatch[1]}`,
  });

  return JSON.parse(json).data[0].attributes.platformAttributes.ios.versionHistory;
}

module.exports = {
  apiApp, apiRatings, apiSearch, apiReviews,
  apiList, apiDeveloper, apiSimilar, apiSuggest, apiVersionHistory,
};