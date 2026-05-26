'use strict';

/**
 * lib/normalize.js — 数据归一化
 *
 * cleanApp  : 将 iTunes Lookup API 原始字段映射为统一格式
 * slimApp   : 精简版应用信息（用于列表展示）
 * lookup    : 通过 id 或 bundleId 批量查询应用详情
 */

const { request } = require('./request');

const LOOKUP_URL = 'https://itunes.apple.com/lookup';

/**
 * 将 iTunes API 原始 app 对象映射为标准格式。
 * @param {object} app  iTunes API 返回的原始对象
 */
function cleanApp (app) {
  return {
    id                   : app.trackId,
    appId                : app.bundleId,
    title                : app.trackName,
    url                  : app.trackViewUrl,
    description          : app.description,
    icon                 : app.artworkUrl512 || app.artworkUrl100 || app.artworkUrl60,
    genres               : app.genres,
    genreIds             : app.genreIds,
    primaryGenre         : app.primaryGenreName,
    primaryGenreId       : app.primaryGenreId,
    contentRating        : app.contentAdvisoryRating,
    languages            : app.languageCodesISO2A,
    size                 : app.fileSizeBytes,
    requiredOsVersion    : app.minimumOsVersion,
    released             : app.releaseDate,
    updated              : app.currentVersionReleaseDate || app.releaseDate,
    releaseNotes         : app.releaseNotes,
    version              : app.version,
    price                : app.price,
    currency             : app.currency,
    free                 : app.price === 0,
    developerId          : app.artistId,
    developer            : app.artistName,
    developerUrl         : app.artistViewUrl,
    developerWebsite     : app.sellerUrl,
    score                : app.averageUserRating,
    reviews              : app.userRatingCount,
    currentVersionScore  : app.averageUserRatingForCurrentVersion,
    currentVersionReviews: app.userRatingCountForCurrentVersion,
    screenshots          : app.screenshotUrls,
    ipadScreenshots      : app.ipadScreenshotUrls,
    appletvScreenshots   : app.appletvScreenshotUrls,
    supportedDevices     : app.supportedDevices,
  };
}

/**
 * 精简应用信息，用于搜索结果、榜单、开发者列表等场景。
 * @param {object} app  cleanApp() 已归一化的对象
 */
function slimApp (app) {
  return {
    id          : app.id,
    appId       : app.appId,
    title       : app.title,
    developer   : app.developer,
    developerId : app.developerId,
    score       : app.score,
    reviews     : app.reviews,
    price       : app.price,
    free        : app.free,
    primaryGenre: app.primaryGenre,
    released    : app.released,
    updated     : app.updated,
    version     : app.version,
    url         : app.url,
  };
}

/**
 * 通过 iTunes Lookup API 批量获取应用详情。
 *
 * @param {Array<string|number>} ids     应用 ID 列表
 * @param {'id'|'bundleId'}      idField ID 类型
 * @param {string}               country 两位国家代码
 * @param {string}               [lang]  语言代码
 * @returns {Promise<object[]>}  cleanApp 格式的应用数组
 */
async function lookup (ids, idField = 'id', country = 'us', lang) {
  const langParam = lang ? `&lang=${lang}` : '';
  const url = `${LOOKUP_URL}?${idField}=${ids.join(',')}&country=${country}&entity=software${langParam}`;
  const body = await request(url);
  const data = JSON.parse(body);
  return data.results
    .filter((a) => typeof a.wrapperType === 'undefined' || a.wrapperType === 'software')
    .map(cleanApp);
}

module.exports = { cleanApp, slimApp, lookup };