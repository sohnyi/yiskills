'use strict';

/**
 * lib/request.js — HTTP 请求层
 *
 * - 自动检测 Node 版本：
 *     Node >= 18  → 使用原生 global fetch
 *     Node 12–17  → 使用内置 https/http 模块实现 fetch 兼容层
 *     Node < 12   → 启动时报错退出
 * - 统一错误分类：404 / 429+503（限速）/ 其他 4xx5xx
 * - 指数退避重试（最多 3 次），处理 429 / 503 / 网络抖动
 * - AbortController 超时（Node < 15 自动 polyfill）
 */

// ── Node 版本检查 ─────────────────────────────────────────────────────────────

const [nodeMajor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 12) {
  process.stderr.write(`Error: Node.js >= 12 is required (current: ${process.version})\n`);
  process.exit(1);
}

// ── AbortController polyfill（Node 12–14 缺失） ───────────────────────────────

if (typeof AbortController === 'undefined') {
  global.AbortController = class AbortController {
    constructor () {
      this.signal = { aborted: false, _listeners: [] };
      this.signal.addEventListener = (_, fn) => this.signal._listeners.push(fn);
      this.signal.removeEventListener = (_, fn) => {
        this.signal._listeners = this.signal._listeners.filter(f => f !== fn);
      };
    }
    abort () {
      this.signal.aborted = true;
      this.signal._listeners.forEach(fn => fn());
    }
  };
}

// ── fetch polyfill（Node 12–17 缺少原生 fetch） ───────────────────────────────

if (typeof fetch === 'undefined') {
  const https = require('https');
  const http  = require('http');

  /**
   * 轻量级 fetch 兼容层，使用 Node 内置模块实现。
   * 仅实现 scraper 所需的最小接口子集：
   *   response.status / response.text() / response.ok
   * 支持：HTTPS/HTTP、自动跟随重定向（最多 5 跳）、AbortSignal
   */
  function nodeFetch (url, opts = {}, _redirects = 0) {
    return new Promise((resolve, reject) => {
      if (_redirects > 5) return reject(new Error('Too many redirects'));

      let urlObj;
      try { urlObj = new URL(url); } catch (e) { return reject(e); }

      const lib     = urlObj.protocol === 'https:' ? https : http;
      const reqOpts = {
        hostname : urlObj.hostname,
        port     : urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path     : urlObj.pathname + urlObj.search,
        method   : (opts.method || 'GET').toUpperCase(),
        headers  : opts.headers || {},
      };

      const req = lib.request(reqOpts, (res) => {
        // 跟随重定向
        if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).href;
          return resolve(nodeFetch(next, opts, _redirects + 1));
        }

        const chunks = [];
        res.on('data',  (c) => chunks.push(c));
        res.on('error', reject);
        res.on('end',   () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve({
            status : res.statusCode,
            ok     : res.statusCode >= 200 && res.statusCode < 300,
            text   : () => Promise.resolve(body),
          });
        });
      });

      req.on('error', reject);

      // AbortSignal 支持
      if (opts.signal) {
        const onAbort = () => {
          req.destroy();
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
        };
        if (opts.signal.aborted) { req.destroy(); return reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })); }
        opts.signal.addEventListener('abort', onAbort);
        req.on('close', () => opts.signal.removeEventListener('abort', onAbort));
      }

      req.end();
    });
  }

  global.fetch = nodeFetch;
}

// ── 公共 HTTP 请求函数 ────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 带指数退避重试的 HTTP 请求。
 *
 * @param {string} url
 * @param {Record<string,string>} [headers={}]
 * @param {number} [timeoutMs=10000]
 * @returns {Promise<string>} 响应体文本
 */
async function request (url, headers = {}, timeoutMs = 10000) {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const res = await fetch(url, { method: 'GET', headers, signal: ctrl.signal });
      clearTimeout(timer);

      if (res.status === 404) {
        const err = new Error(`Not found: ${url}`);
        err.statusCode = 404;
        throw err;
      }
      if (res.status === 429 || res.status === 503) {
        if (attempt === MAX_RETRIES) {
          const err = new Error(`Rate limited (HTTP ${res.status}) after ${MAX_RETRIES} retries`);
          err.statusCode = res.status;
          throw err;
        }
        const wait = Math.pow(2, attempt) * 1000 + Math.random() * 400;
        log(`  [retry] HTTP ${res.status} — waiting ${Math.round(wait)}ms (${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(wait);
        continue;
      }
      if (res.status >= 400) {
        const err = new Error(`HTTP ${res.status}: ${url}`);
        err.statusCode = res.status;
        throw err;
      }

      return res.text();

    } catch (err) {
      clearTimeout(timer);

      if (err.name === 'AbortError') {
        throw new Error(`Request timeout (${timeoutMs}ms): ${url}`);
      }
      // 非限速错误立即抛出，不重试
      if (err.statusCode && err.statusCode !== 429 && err.statusCode !== 503) throw err;
      // 已达最大重试次数
      if (attempt === MAX_RETRIES) throw err;

      const wait = Math.pow(2, attempt) * 800;
      log(`  [retry] Network error — waiting ${wait}ms: ${err.message}`);
      await sleep(wait);
    }
  }
}

function log (msg) { process.stderr.write(msg + '\n'); }

module.exports = { request, sleep, log };