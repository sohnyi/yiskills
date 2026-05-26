---
name: appstore-scraper
description: >
  使用零依赖脚本获取 App Store 数据并分析。当用户说"竞品分析 X"、"分析 X 的用户评价"、
  "X 的 App Store 评分怎么样"、"帮我看看 X 的差评"、"X 的用户在抱怨什么"、
  "分析竞品评论"、"App Store 榜单"、"scrape reviews"、"ratings"、"app store data"
  时触发（X 可以是任意 App 名称，如 Remini、Lensa、Duolingo 等）。覆盖场景：
  竞品研究、用户痛点挖掘、版本口碑监控、市场调研、自有 App 评论分析。
---

# App Store Scraper

零依赖、开箱即用的 App Store 数据抓取工具。
**要求：Node.js >= 18**（使用内置 `fetch`，无需 `npm install`）。

---

## 使用方式

```bash
# 直接运行，无需任何安装步骤
node scripts/scrape.js <command> [options]
```

---

## 命令速查

| 命令 | 用途 |
|---|---|
| `search` | 按关键词搜索应用，获取 appId / id |
| `app` | 获取单个应用的完整详情与评分直方图 |
| `ratings` | 获取评分分布（星级直方图） |
| `reviews` | 抓取指定页数的评论（单一排序） |
| `bulk-reviews` | **抓取最多 1000 条有内容的评论（双排序去重）** |
| `list` | 查看 App Store 榜单 |
| `developer` | 获取某开发者旗下所有应用 |
| `similar` | 获取"用户还购买了"相似应用 |
| `suggest` | 获取搜索关键词补全建议（ASO 研究） |
| `version-history` | 获取应用版本发布历史 |

---

## 竞品分析标准流程（Claude 执行步骤）

> 用户说"竞品分析 Remini"、"帮我分析 Lensa 的评价"等时，Claude 按此流程执行。

**Step 1 — 查找 appId**

```bash
node scripts/scrape.js search --term "Remini" --num 5 --country us
```

从结果中确认目标 App 的 `appId`（bundle ID）和 `id`（numeric trackId）。

**Step 2 — 获取应用基本信息与评分分布**

```bash
node scripts/scrape.js app --appId <appId> --country us
```

记录：`score`（综合评分）、`ratings`（总评分数）、`histogram`（各星级分布）、
`version`、`updated`、`price`、`developer`。

**Step 3 — 抓取最近 1000 条有内容的评论**

```bash
node scripts/scrape.js bulk-reviews --appId <appId> --country us --target 1000 > reviews.json
```

脚本自动：同时抓取 `recent`（最新）和 `helpful`（最有用）两种排序各 10 页，
合并后按 review ID 去重，过滤无实质内容的条目，返回最多 1000 条，按时间倒序排列。
进度输出到 stderr，不影响 JSON 输出。

**Step 4 — Claude 分析评论数据**

拿到 `reviews.json` 后，按以下结构输出分析报告。

---

## Claude 分析规范

拿到评论 JSON 后，按以下结构输出报告：

### 1. 评分概览
- 综合评分、总评分数
- 各星级占比（从 Step 2 的 histogram 计算）
- 近期口碑趋势（对比 1 星与 5 星评论的时间分布）

### 2. 用户痛点（Top 问题）
对 1 星、2 星评论聚类，输出出现频率最高的 5–8 个问题，每条附：
- 问题描述、出现频次估计、典型用户原话摘要（改写，不直接引用）

### 3. 用户好评亮点
对 4 星、5 星评论聚类，输出用户最常称赞的 3–5 个功能或体验。

### 4. 版本口碑变化
按 `version` 字段分组，对比近两到三个主要版本的评分变化，
识别某次更新后是否出现口碑明显下滑或回升。

### 5. 差异化机会
结合痛点和好评，总结 2–3 条对竞品产品机会分析，格式：
- **问题**：用户在 X 上反复抱怨 ___
- **机会**：自己的产品可以通过 ___ 来解决这个问题

### 6. 数据说明
- 抓取时间、评论数量、覆盖时间范围、国家/地区、数据局限性

---

## 各命令详细说明

### search — 关键词搜索

```bash
node scripts/scrape.js search --term "photo editor" --num 20 --country us
```

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--term` | 必填 | 搜索关键词 |
| `--num` | 10 | 返回数量（最多 200） |
| `--country` | us | 两位国家/地区代码 |
| `--page` | 1 | 结果页码（注：Apple 一次返回全量，分页为内存切片） |

---

### app — 应用详情

```bash
node scripts/scrape.js app --appId com.example.myapp --country us
node scripts/scrape.js app --id 553834731 --country jp
```

返回完整元数据，含评分直方图（`histogram`）、`description`、`releaseNotes`、
`version`、`price`、`developer` 等。

---

### ratings — 评分分布

```bash
node scripts/scrape.js ratings --appId com.example.myapp
node scripts/scrape.js ratings --id 553834731 --country gb
```

```json
{
  "ratings": 652719,
  "histogram": { "1": 7012, "2": 6655, "3": 26876, "4": 140680, "5": 471496 }
}
```

---

### reviews — 单排序评论抓取

```bash
node scripts/scrape.js reviews --appId com.example.myapp --pages 5 --sort helpful --delay 1000
```

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--pages` | 1 | 抓取页数（每页约 50 条，Apple 最多 10 页） |
| `--sort` | recent | `recent` 或 `helpful` |
| `--country` | us | 国家/地区代码 |
| `--delay` | 800 | 翻页间隔（毫秒），建议不低于 500 |

---

### bulk-reviews — 批量抓取（竞品分析推荐）

```bash
node scripts/scrape.js bulk-reviews --appId com.example.myapp > reviews.json
node scripts/scrape.js bulk-reviews --appId com.example.myapp --target 500 --country jp
node scripts/scrape.js bulk-reviews --appId com.example.myapp --delay 1500
```

| 参数 | 默认值 | 说明 |
|---|---|---|
| `--target` | 1000 | 目标返回条数上限 |
| `--country` | us | 国家/地区代码 |
| `--delay` | 800 | 每次翻页间隔（毫秒）；两种排序之间自动等待 2× delay |

---

### list — App Store 榜单

```bash
node scripts/scrape.js list --collection TOP_FREE_IOS --num 50
node scripts/scrape.js list --collection TOP_GROSSING_IOS --category PHOTO_AND_VIDEO --num 20 --country jp
```

**常用 collection 值：**
`TOP_FREE_IOS` `TOP_GROSSING_IOS` `TOP_PAID_IOS`
`TOP_FREE_IPAD` `TOP_GROSSING_IPAD`
`NEW_FREE_IOS` `NEW_PAID_IOS`
`TOP_FREE_MAC` `TOP_GROSSING_MAC`

**常用 category 值：**
`GAMES` `PHOTO_AND_VIDEO` `PRODUCTIVITY` `SOCIAL_NETWORKING`
`HEALTH_AND_FITNESS` `EDUCATION` `ENTERTAINMENT` `UTILITIES`
`TRAVEL` `LIFESTYLE` `MUSIC` `FINANCE` `NEWS`

---

### developer — 开发者旗下应用

```bash
node scripts/scrape.js developer --devId 284882218 --country us
```

---

### similar — 相似应用

```bash
node scripts/scrape.js similar --appId com.example.myapp
```

---

### suggest — 关键词补全（ASO 研究）

```bash
node scripts/scrape.js suggest --term "photo edit" --country us
```

返回 `[{ term: "photo editor" }, ...]`，适合做 ASO 关键词研究。

---

### version-history — 版本发布历史

```bash
# 需要 numeric trackId（--id）
node scripts/scrape.js version-history --id 553834731
```

返回 `[{ versionDisplay, releaseNotes, releaseDate, releaseTimestamp }, ...]`。

---

## 实用技巧

**国家/地区代码**：`us` `gb` `de` `fr` `jp` `cn` `au` `ca` `kr` `sg` `hk` `tw`

**限速说明**：默认 800ms 延迟适合大多数情况。遇到连接重置或超时，将 `--delay` 调大至 1500–2000ms。内置指数退避重试（最多 3 次），自动处理 429 限速响应。

**`id` vs `appId`**：`id` 是 iTunes 数字 trackId（如 `553834731`）；
`appId` 是 bundle identifier（如 `com.example.app`）。未知时先用 `search` 获取。

**输出处理**：所有命令输出 JSON 到 stdout，可直接重定向保存：

```bash
# 保存并用 jq 过滤差评：
node scripts/scrape.js bulk-reviews --appId com.example.app \
  | jq '[.[] | select(.score <= 2) | {score, title, text, version}]'
```

**bulk-reviews 实际上限**：Apple 每种排序最多 10 页 × ~50 条 = 500 条，
两种合并去重后通常可获得 600–900 条有内容评论。`--target 1000` 是上限，实际数量以脚本输出日志为准。