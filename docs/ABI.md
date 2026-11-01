# QPlayer 插件 ABI 1.0

<p><b>简体中文</b> · <a href="ABI.en.md">English</a></p>

本文档以 **QPlayer 1.9.6** 的实现为基线，描述音源插件的 handler、返回结构和宿主调用。
`schemaVersion` 为 `1`，`apiVersion` 仍为 `1.0`，不代表所有 1.0 宿主都提供相同功能。
兼容检查要求 API 主版本相同、请求的次版本不高于宿主，并检查可选的 `minHostVersion`。
使用近期接口时，按实际使用的功能与验证结果设置最低宿主版本；本文不推测未知的引入版本。
默认模板只返回空搜索分页，保留最低宿主版本 `1.4.0`。

QPlayer 本体不包含在线音源。用户安装的 `.qplug` 提供搜索、歌单、播放地址、歌词和登录。
宿主校验已定义的字段并渲染结果；未识别的附加字段不一定报错，不能依赖它们产生效果。

除明确写为字节的限制外，文中字符串长度按 Java `String.length()` 计数，即 UTF-16
代码单元，不是 UTF-8 字节数。MiB 表示 1024 × 1024 字节。

---

## 一、运行方式

插件是 CommonJS JavaScript，运行在嵌入的 Rhino 引擎中，每个插件一个独立 Realm。
插件无法访问 Java 类、`Packages`、文件系统、其他插件的数据以及 QPlayer 的 QML 场景。
唯一的外部接口是全局对象 `qplayer`。

每个插件对应一条 actor 线程，JavaScript 执行串行化；异步等待之间仍需维护好业务状态。
单次调用的默认超时为 **90 秒**，包括等待宿主调用的时间。

默认无权限示例：

```js
module.exports = {
  handlers: {
    searchSongs: function (args) {
      return {items: [], nextCursor: ""};
    }
  }
};
```

联网搜索的完整映射示例见 [README](../README.md#下一步)。示例端点不是内置音源。

handler 可以返回值或 Promise。`require()` 只能加载包内的相对路径 `.js` 文件，
单个模块不超过 4 MiB。

清单中声明的能力必须全部实现。插件启动时宿主逐个检查 `handlers[capability]` 是否
存在，缺少任意一个则拒绝启用，避免界面上出现无响应的入口。

---

## 二、`plugin.json`

```json
{
  "schemaVersion": 1,
  "id": "example",
  "name": "Example Source",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "minHostVersion": "1.9.6",
  "entry": "src/main.js",
  "capabilities": ["searchSongs", "resolveStream", "lyrics"],
  "permissions": ["network"],
  "networkDomains": ["api.example.com", "*.cdn.example.com"],
  "networkMethods": ["GET", "POST"],
  "ui": []
}
```

| 字段 | 说明 |
|---|---|
| `schemaVersion` | 固定 `1` |
| `id` | 插件/音源标识，同时是所有媒体 ID 的前缀。`local` 为宿主保留 |
| `name` | 显示名，≤80 字符 |
| `version` | 插件版本，发版 tag 必须与之一致 |
| `apiVersion` | 当前为 `1.0` |
| `minHostVersion` | 可选。低于该版本的 QPlayer 拒绝安装 |
| `entry` | 入口 JS，包内相对路径 |
| `capabilities` | 见第四节，仅声明已实现的能力 |
| `permissions` | 见下表，仅声明实际使用的权限 |
| `networkDomains` | 精确域名或 `*.example.com`，需同时声明 `network` 权限 |
| `networkMethods` | `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD` 的子集，留空等价于 `["GET","POST"]` |
| `ui` | 声明式弹窗入口，最多 8 个，见第八节 |

所有路径均为包内相对路径，不能包含 `..`、反斜杠、协议头或绝对路径。

这里的 `1.9.6` 是完整参考示例的基线，不是所有能力的首次支持版本。
`publisher` 为发布者说明，`icon` 为可选包内资源路径。清单 `ui[].source` 是历史兼容字段，
宿主接受但不执行。`require()` 的相对模块路径与清单资源路径不同，可用 `./module.js`。

### 权限

| 权限 | 授予后可以 |
|---|---|
| `network` | 调用 `http.request`，以及返回 http(s) URL |
| `clearTextNetwork` | 访问明文 `http://` |
| `localNetwork` | 访问内网/环回地址；未授予时这类地址在 DNS 解析后被拒绝 |
| `credentials` | 读写加密凭据库；`login` 能力强制要求 |
| `webAuth` | 网页登录与受控系统 WebView 脚本执行 |
| `clipboard` | 写入系统剪贴板 |
| `openUrl` | 历史保留权限；当前没有可用的 `openUrl.*` 宿主方法 |
| `playbackRead` | 读取当前播放状态 |
| `playbackControl` | 播放、暂停、跳转、切歌 |
| `queueWrite` | 整体替换播放队列 |
| `notifications` | 显示宿主的 Toast/Snackbar |
| `customUi` | 贡献声明式弹窗入口 |
| `backgroundTimers` | 导出 `backgroundTick`，约每秒被调用一次 |
| `files.save` | 调用 `files.save` 与 `files.downloadCurrent`，见第七节 |

安装时这些权限列出供用户确认。权限不会自动授予其他权限：例如 `webAuth` 和
`files.save` 均不隐含 `network`。返回网络 URL 还需 `network` 与域名授权。

---

## 三、媒体 ID

插件只处理服务自身的原生 ID，例如 `2668056312`。跨插件唯一的规范 ID 由宿主生成：

```text
<provider>:<kind>:<百分号编码的原生 ID>
```

`kind` 为 `song`、`album`、`artist`、`playlist`、`user` 之一。原生 ID 上限 2048 字节，
不能包含控制字符。

插件只会收到属于自己的原生 ID，且不应构造其他 provider 的规范 ID。队列、缓存、歌单
上下文和界面跳转全部基于规范 ID，构造非法值会导致宿主抛出异常。

---

## 四、能力与 handler

每个 capability 对应同名 handler，按用途分组如下。

### 搜索

| handler | 入参 | 返回 |
|---|---|---|
| `searchSongs` | `{query, cursor, limit}`，limit 1–100 | `{items: Song[], nextCursor}`，items ≤200 |
| `searchAlbums` | 同上 | `{items: Album[], nextCursor}` |
| `searchArtists` | 同上 | `{items: Artist[], nextCursor}` |
| `hotSearch` | `{}` | 字符串数组，取前 50 条 |

`cursor` 对宿主不透明，可以是 offset、页码或服务端 token，≤8192 字符。没有下一页时
返回空串。

宿主只读取 `items` 与 `nextCursor`，不读取 `hasMore`、`total` 或页码等附加字段。
没有下一页时返回 `nextCursor: ""`；任何非空游标均表示还有下一页。`limit` 是请求建议，
解析器的硬上限是每页 200 条，超出会失败，不保证按请求的 `limit` 自动截断。

### 详情

| handler | 入参 | 返回 |
|---|---|---|
| `songDetails` | `{ids: string[]}`，≤500 | `Song[]` |
| `playlistDetails` | `{id}` | `Playlist`，`songs` ≤20000 |
| `albumDetails` | `{id}` | `Album`，`songs` ≤5000 |
| `artistDetails` | `{id}` | `Artist`，`songs`/`albums` 各 ≤1000 |

### 首页与个人内容

| handler | 入参 | 返回 |
|---|---|---|
| `home` | `{limit}` | `{songs, playlists, sections}` |
| `home` | `{operation: "recommendSongs"}` | `Song[]`，为数组而非对象 |
| `recent` | `{limit}`，limit 1–500 | `Song[]` |
| `userPlaylists` | `{limit}`，limit 1–500 | `Playlist[]` |

`home` 一个 handler 服务两种调用，通过 `operation` 区分：无 `operation` 时返回首页
数据；`operation` 为 `recommendSongs` 时返回「每日推荐」一类的歌曲列表。

首页三部分的用途：

- `songs`（≤100）——推荐歌曲。
- `playlists`（≤100）——推荐歌单栅格。`limit` 只约束这一部分，取值来自用户在设置中的
  「首页歌单数量」。
- `sections`（≤6 组，每组 ≤30 个歌单）——绘制在栅格上方的分组，结构为
  `{title, playlists}`。适用于音源本身即有分区名称的列表，例如网易云的雷达歌单、
  专属场景歌单。空分组会被丢弃。

### 播放与歌词

| handler | 入参 | 返回 |
|---|---|---|
| `resolveStream` | `{id, quality}` | 见下 |
| `lyrics` | `{id}` | `{assets: [...]}` |
| `scrobble` | `{id, playedMs, durationMs, completed}` | 宿主忽略返回值 |
| `heartRecommendation` | `{songId, playlistId, limit}` | `Song[]` |

`resolveStream` 返回：

```js
{
  url: "https://...",          // 必填，必须位于声明的域名内
  headers: {"Referer": "..."}, // 可选，≤64 条，值 ≤8192 字符且不含换行
  mimeType: "audio/mpeg",      // 可选
  expiresAtMs: 1700000000000,  // 可选，缓存有效期的时间戳元数据
  trial: false,                // 试听片段
  cacheable: true,             // 默认 true，一次性 URL 应设为 false
  renditionId: "1234"          // 可选，实际音轨与请求不一致时使用
}
```

`Host`、`Content-Length`、`Connection` 三个请求头会被丢弃。

`quality` 由宿主传入，当前播放/下载使用 `standard`、`higher`、`exhigh`、`lossless`、
`hires` 等值，插件负责映射到服务自身的档位；不要据此承诺服务一定提供对应音质。
`renditionId` 是同插件歌曲的原生 ID。`trial` 与 `cacheable` 默认分别为 `false` 和 `true`。
播放地址起始 URL 必须授权，但播放器后续 CDN 重定向并不逐跳应用 `networkDomains`；
宿主音频下载也使用这一规则。不要把 `http.request` 的逐跳策略描述成所有媒体路径的策略。

`lyrics` 返回有序的 `assets` 数组，无歌词时返回 `{assets: []}`：

```js
return {assets: [
  {format: "yrc", role: "original", text: "[0,1000](0,1000,0)Hello"},
  {format: "lrc", role: "translation", text: "[00:00.00]你好"},
  {format: "lrc", role: "romanization", text: "[00:00.00]Hello"}
]};
```

| 字段 | 插件边界接受的值 |
|---|---|
| `format` | 必填，`lrc`、`yrc`、`ttml`；会转为小写 |
| `role` | `original`、`translation`、`romanization`；省略或空串默认为 `original`，区分大小写 |
| `text` | 必填非空字符串，最多 4 × 1024 × 1024 个 UTF-16 代码单元 |

最多 12 个 asset。每个 role 只有一份时，播放器按数组顺序选择原文、翻译和音译。
应把期望使用的原文放在前面：尚未选出基础歌词时，重复的翻译或音译可能被用作基础歌词，
因此不要用重复 role 提供格式备选。宿主不按格式排序，所选基础歌词解析为空时也不会
切换到另一个 asset。翻译和音译按起始时间匹配到最近的原文行。TTML 自带的翻译/音译
由 TTML 解析器处理，另附 sidecar 时会对匹配行写入对应字段。

下载的歌词文本选择首个非空 `original`；若不存在，则取首个其他非空 asset 的原始文本。
它不合并翻译，也不把 YRC/TTML 转为 LRC。该路径与播放器的歌词解析不同。
宿主本地文件/内部解析器还支持 QRC、LYS、ESLRC、word-time LRC 等，但插件边界目前
不接受这些 `format` 或 `translated`/`romaji` role 别名。插件须先转换为允许的格式。

### 账号与收藏

| handler | 入参 | 返回 |
|---|---|---|
| `account` | `{}` | `Account` |
| `login` | `{operation, ...}` | 见第六节 |
| `like` | `{operation: "list"}` | 原生歌曲 ID 数组，≤100000 |
| `like` | `{operation: "set", id, liked}` | `true` 或 `{success: true}` |
| `playlistMutation` | `{operation, playlistId, songIds, name}` | 同上 |
| `playlistReorder` | `{playlistId, songIds}`，完整新顺序，1–10000 个不重复的同源歌曲原生 ID | `true` 或 `{success: true}` |
| `playlistCover` | `{playlistId, imageBase64, filename, mimeType}`，原图 ≤8 MiB，文件名不是路径 | `true` 或 `{success: true}` |
| `share` | `{id, kind}` | 分享链接字符串 |

`playlistMutation` 的 `operation` 取值：`add`、`remove`、`subscribe`、`unsubscribe`、
`delete`、`create`。`create` 没有 `playlistId`，入参为
`{operation:"create", name, private}`，返回 `{id: "新歌单原生ID"}` 或 ID 字符串。
其余操作的 `songIds` ≤1000。

`matchSong` 仍在能力枚举中，但当前没有宿主路由、参数或返回值契约，不应当作可调用匹配接口。
`listenTogether` 也是历史兼容能力，宿主不路由其 handler。现有功能应由插件通过声明式
UI、`backgroundTick` 和通用播放接口实现。清单声明这些名称仍受“必须有同名 handler”的
启动检查约束，因此新插件不应为了功能标签而声明它们。

---

## 五、数据结构

宿主按各字段的规则解析数据。多数有界数组越界会使整个响应失败；`hotSearch` 等少数路径
会截断。不要把所有字段理解为同一套严格拒绝策略。缺失的可选字段取默认值。

### Song

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string/number | **必填**，原生 ID |
| `title` | string | **必填**，≤4096 |
| `durationMs` | number | 0 – 31 天 |
| `artworkUrl` | string | 封面原图，须位于授权域名内，否则被清空 |
| `artworkThumbUrl` | string | 列表行使用的小图，见下 |
| `artists` | array | ≤64 个 `{id, name}`，无 `name` 的条目被丢弃 |
| `album` | object | `{id, name}`，`name` 为空时整个字段不设置 |
| `isrc` | string | 可选 |
| `playable` | boolean | 默认 `true` |
| `trial` | boolean | 仅有试听 |
| `restricted` | boolean | 受区域或版权限制 |

`artworkThumbUrl` 用于列表行。歌曲行高约 48dp，而音源提供的封面通常在一千像素量级；
没有该字段时，滚动长歌单需要为每一行下载并完整解码一张原图，造成掉帧与频繁 GC。
若图床支持缩放参数（网易云 `?param=140y140`、QQ `T002R300x300`），应填写此字段；
未填写时回退到 `artworkUrl`。该字段与 `artworkUrl` 使用同一套域名校验。需要宿主
1.5.1 及以上。

### Playlist

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string/number | **必填** |
| `name` | string | **必填**，≤4096 |
| `description` | string | ≤1048576 个 UTF-16 代码单元 |
| `artworkUrl` / `artworkThumbUrl` | string | 同上 |
| `trackCount` | number | 曲目数 |
| `playCount` | number | 播放量；无曲目数时界面改为显示该值 |
| `subscribed` / `owned` | boolean | 是否已收藏 / 是否为自建 |
| `mutable` / `deletable` | boolean | 默认跟随 `owned`，可显式覆盖 |
| `owner` | object | `{id, name}` |
| `songs` | array | ≤20000 |

### Album / Artist

Album：`id`、`name`（必填）、`artworkUrl`、`publishTimeMs`、`description`、
`trackCount`（≤100 万）、`artists`（≤64）、`songs`（≤5000）。

Artist：`id`、`name`（必填）、`artworkUrl`、`description`、`albumCount`、
`songCount`、`songs`（≤1000）、`albums`（≤1000）。

### Account

`loggedIn`、`id`、`displayName`、`avatarUrl`、`membershipTier`（0–1000）、
`level`（0–100000）、`signature`。头像 URL 同样需位于授权域名内。

---

## 六、登录

登录界面由宿主提供，流程由插件定义。`login` 一个 handler 处理五种 `operation`：

| operation | 入参 | 返回 |
|---|---|---|
| `methods` | `{operation:"methods", platform}`，当前为 `android` 或 `desktop` | 登录方式数组，≤8 |
| `begin` | `{methodId}` | Challenge |
| `poll` | `{challengeId}` | Challenge |
| `submit` | `{methodId, credential}` | Challenge |
| `logout` | `{}` | `true` |

登录方式结构：

```js
{
  id: "qr",                    // [a-z][a-z0-9._-]{0,63}
  type: "qr",                  // qr | web | credential | app
  label: "扫码登录",
  instructions: "用手机 App 扫描二维码",
  // type 为 web 时必填，必须是 HTTPS 且位于授权域名内：
  webUrl: "https://example.com/login",
  cookieUrl: "https://example.com",
  credentialCookieName: "SESSION",
  // type 为 credential 时可选：
  credentialLabel: "粘贴 Cookie",
  // type 为 app 时可选的按钮名称：
  appLabel: "打开应用确认"
}
```

`methods` 可按平台筛选方式；旧调用也可能不带 `platform`。`app` 面向具备 App 链接启动器
的宿主，桌面上不能假定可用。插件通过 `begin` 返回 `appUrl`，宿主只在用户点击后打开。
不需要靠 `openUrl` 权限打开这一受控登录链接。

`web` 需要 `webAuth` 权限。`webUrl` 和 `cookieUrl` 必须是已授权 HTTPS URL，
`credentialCookieName` 为 `[A-Za-z0-9_.-]{1,64}`。宿主用该名称检查登录 Cookie 是否存在，
然后把 `cookieUrl` 对应的 Cookie header 传给 `login` 的 `submit`，而非只返回指定的一条。
插件负责校验并保存凭据，QPlayer 不解释厂商 Cookie 的业务语义。

Challenge 是流程的一次状态快照：

```js
{
  id: "challenge-1",
  methodId: "qr",
  status: "waiting",           // waiting | scanned | success | expired | failed
  message: "等待扫码",
  qrContent: "https://...",    // 由宿主渲染二维码
  expiresAtMs: 0,
  account: {loggedIn: true, id: "user-1", displayName: "Example"}
}
```

Challenge 还可返回 `qrImageBase64`（裸 PNG Base64，不带 data URI 前缀，最多 300000 字符）。
宿主检查 Base64 和 PNG 文件头；有图片时优先显示图片，否则由 `qrContent` 生成二维码。
`qrContent`、`message` 最多 64 Ki 字符，`appLabel` 最多 4096 字符。
`appUrl` 的 HTTPS 链接须位于网络授权内；自定义 scheme 仅允许
`snssdk1128`、`snssdk2329`、`snssdk8478`、`snssdk8663`、`luna`、`aweme`、
`orpheus`、`orpheuswidget`、`wtloginmqq`、`mqqapi`、`mqq`、`qqmusic`。
未知或不允许的链接被清空，不会自动打开。`http`、`intent`、`file` 等不是允许的 App scheme。

凭据由插件通过 `credentials.put` 保存，`logout` 时应删除对应的 key。凭据以 AES-GCM
加密并按插件命名空间隔离，QPlayer 不解析其内容。

---

## 七、`qplayer.call`

所有调用均为异步，返回 Promise。

| 方法 | 权限 | 说明 |
|---|---|---|
| `storage.get/put/delete` | — | `{key}` / `{key,value}`；key 为 `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`，单个存储记录（含 key/value 的 JSON）≤1 MiB，不是插件总配额 |
| `credentials.get/put/delete` | `credentials` | 加密存储，按插件与 key 隔离 |
| `http.request` | `network` | 见下 |
| `crypto.digest/random/aes/hmac/modPow/x25519` | — | 见下 |
| `compression.gunzip` | — | `{data, dataEncoding, outputEncoding}` |
| `playback.read` | `playbackRead` | 当前播放快照 |
| `playback.play/pause/seek/select/next/blockAutoAdvance` | `playbackControl` | 与音源无关的播放控制 |
| `queue.replace` | `queueWrite` | `{songs, currentSongId, positionMs, playing}` |
| `notifications.toast` | `notifications` | `{message}`，≤500 字符 |
| `clipboard.write` | `clipboard` | `{text}`，≤16384 个 UTF-16 代码单元 |
| `webAuth.runScript` | `webAuth` | `{originUrl, script}`；脚本通过 `qplayerWebAuthDone(string)` 返回结果 |
| `files.save` | `files.save`，URL 另需网络授权 | `{url, filename, mimeType, headers}`；用户选择保存位置后下载 |
| `files.downloadCurrent` | `files.save` | `{}`；打开当前歌曲的宿主音质与下载流程 |

### webAuth.runScript

`originUrl`（≤2048 字符）必须是 `networkDomains` 已授权的 http(s) URL；HTTP 还需
`clearTextNetwork`。脚本最多 256 Ki 字符，使用 `qplayerWebAuthDone(string)` 返回
最多 64 Ki 字符的结果。平台会销毁会话；超时为 45 秒，每个平台同一时刻只允许一个会话。
Android 在带 `originUrl` 基地址的空 HTML 中运行脚本，桌面先导航到该 URL 再注入脚本；
不能假定两者具有相同初始文档。SDK 地址、初始化流程和结果解析由插件负责。
缺少系统 WebView、桌面无界面模式或 Android Activity 不可用时调用失败。
WebView 子资源和请求不经过 `http.request` 的 DNS/重定向策略，因此 `webAuth` 应只授予
确实需要浏览器环境的可信插件。网页登录与脚本执行的 URL 条件不同，不应混用。

### http.request

```js
qplayer.call("http.request", {
  url: "https://api.example.com/x",
  method: "POST",
  headers: {"Content-Type": "application/x-www-form-urlencoded"},
  body: "a=1&b=2",
  timeoutMs: 10000,        // 1000–30000
  includeBase64: false,    // 需要二进制内容时置 true
  followRedirects: true    // false 时返回重定向响应本身
})
// → {status, finalUrl, body, headers, setCookies, bodyBase64?}
```

URL 必须命中 `networkDomains`，方法必须在 `networkMethods` 内；DNS 解析为受限地址
时会被拒绝，访问内网/环回地址需要 `localNetwork`。默认最多跟随 5 次重定向，每跳重新
检查 URL。303 以及 POST 的 301/302 会改为 GET，此时 GET 也必须已声明。
`followRedirects: false` 用于读取原始状态和 Location。`setCookies` 收集已访问响应的
所有 `Set-Cookie`，包括重定向响应；宿主不会替插件维护 Cookie 会话。
DNS 检查与传输层连接分别解析域名，没有请求级 DNS 固定；不能把这一检查视为完整的
DNS 重绑定防护，尤其是同时授予 `clearTextNetwork` 时。

`body` 是 UTF-8 文本；`bodyBase64` 是解码后原样发送的二进制，两者不能同时传入。
也可传 `multipart: {fields: {key: "value"}, file: {field: "file", filename: "cover.png",
mimeType: "image/png", bodyBase64: "..."}}`，与两种 body 互斥。该结构是字段说明，不是
可直接发送的图片示例。最多 32 个字段、每值 4096 字符、一个非空文件；宿主生成 boundary。
未显式传 Content-Type 时宿主为 multipart 添加该头。编码后请求体和响应体各 ≤16 MiB。

未指定 `Accept-Encoding` 时宿主协商 gzip，并在压缩大小与解压后大小均不超 16 MiB
的条件下自动解压；`body` 为 UTF-8 解码文本，`bodyBase64` 为同一份解压后字节。
自动解压后响应头移除 Content-Encoding/Content-Length。自行指定 Accept-Encoding 则
保留响应原始字节，需要时用 `compression.gunzip`。响应 headers 的同名值会合并。
历史兼容路径会把 ptlogin 的 `ptqrlogin` 特定成功重定向转为 `ptuiCB(...)` 文本；
这是特定登录传输行为，不是一般重定向契约。

### 下载

`files.save` 只能下载授权 URL 到用户选择的文件，插件不能传入任意本地路径。宿主清理
建议文件名（输入 ≤180 字符），`mimeType` ≤128 字符，请求头最多处理前 64 条。
每跳检查网络授权，最多 5 次重定向，大小上限 1 GiB，连接/读取超时 120 秒。
`files.downloadCurrent` 不接收 URL 或歌曲 ID，使用调用时的当前歌曲，可能属于其他音源；
无当前歌曲时失败。它打开宿主音质选择与保存流程，最终返回保存是否成功，取消返回
`false`，错误可拒绝 Promise。相关服务依赖平台的保存选择器；调用仍受 handler 的 90 秒
期限影响，不能把底层网络超时当作 handler 可等待时长。

### crypto

宿主提供一组固定原语，覆盖常见音源的签名与加解密需求，不支持任意算法：

- `crypto.digest` — `{algorithm: "SHA-256"|"SHA-1"|"MD5", data, dataEncoding, outputEncoding}`
- `crypto.random` — `{length: 1..1024, outputEncoding}`，省略 length 时为 16
- `crypto.aes` — `{transformation: "AES/CBC/PKCS5Padding"|"AES/ECB/PKCS5Padding"|"AES/GCM/NoPadding", operation: "encrypt"|"decrypt", key, iv, aad, data, outputEncoding}`
- `crypto.hmac` — `{algorithm: "HmacSHA256"|"HmacSHA1", key, data, outputEncoding}`
- `crypto.modPow` — `{baseHex, exponentHex, modulusHex, width}`，返回十六进制字符串；width 是最小十六进制位数，不是字节数
- `crypto.x25519` — `{scalar, point, outputEncoding}`，scalar 与 point 各 32 字节；point 可省略，默认基点 9
- `crypto.sha256` — 历史便捷接口，`{value}` 的 UTF-8 SHA-256，返回十六进制字符串

`data` 默认按 `utf8` 解释，`key`、`iv`、`aad`、`scalar`、`point` 默认按 `base64`；
通过 `<参数名>Encoding` 选择 `utf8`/`base64`/`hex`。输出字段名是 `outputEncoding`，
默认 `base64`，不是 `output`。该输出编码也适用于 `compression.gunzip`。
AES key 为 16/24/32 字节，CBC IV 为 16 字节，GCM IV 为 12 字节；ECB 不使用 IV。

### 播放状态

`playback.read` 返回：

```js
{
  currentSongId: "123",     // 当前歌曲不属于该插件时为空串
  queueSongIds: ["1","2"],  // 队列中混有其他音源时为空数组
  positionMs: 0, durationMs: 0,
  playing: true,
  transitioning: false,     // 宿主正在切歌
  seekRevision: 0,          // 变化表示宿主执行了 seek，不只限于用户拖动
  endRevision: 0            // 变化表示自然结束事件，包括自动前进被阻止时
}
```

这两个 revision 是宿主级递增事件标记，不是队列版本或当前歌曲 ID，也不返回上次结束的
歌曲 ID。即使当前歌曲不属于插件，进度、播放状态和 revision 仍是全局值；身份字段按来源
过滤，不能凭它们推断其他音源的 ID。

| 调用 | 参数与行为 |
|---|---|
| `playback.play/pause/next` | `{}`；控制全局播放器，`next` 走宿主自动前进逻辑 |
| `playback.seek` | `{positionMs}`，限制到 0–31 天 |
| `playback.select` | `{songId, positionMs, playing}`，目标须已在队列，`playing` 默认 true |
| `playback.blockAutoAdvance` | `{blocked}`；阻止自然结束后的自动前进；解除本插件的阻止时可执行待处理前进 |
| `queue.replace` | `{songs, currentSongId, positionMs, playing}`，最多 500 个 Song，全部属于调用插件；目标必须在替换队列中 |

`songId`/`currentSongId` 可用原生 ID，或属于本插件的规范歌曲 ID，不接受跨插件目标。
队列替换会清除原队列与歌单上下文，`playing` 默认 true。`playbackControl` 是全局播放
权限，不限于本插件的歌曲；但选择目标和替换队列受上述同源检查限制。

---

## 八、声明式弹窗

插件不提供 QML。插件在清单中声明入口并返回结构化描述，由 QPlayer 用自身的 Material 3
组件渲染。因此插件弹窗自动跟随应用主题、深浅色与字号，插件无需编写样式；代价是可用
节点仅限下表所列。

```json
{"id": "preferences", "placement": "settings", "label": "插件设置", "icon": "tune"}
```

清单非空 `ui` 需要 `customUi`；每个入口还必须实现 `handlers["ui.<id>"]`。
入口 `label` 最多 40 字符，`icon` 为 `[a-z][a-z0-9_]{0,63}`。

`placement: "settings"` 出现在该插件的设置页；`placement: "playerAction"` 出现在手机
顶栏和平板/桌面的导航栏。QPlayer 不了解入口对应的功能，只负责放置入口。

入口被打开时，宿主调用 `handlers["ui.<入口id>"]`，参数为
`{action, payload: {inputs}}`：

- 打开时 `action` 为 `open`
- 描述中的 `refreshMs`（0，或 500–60000）使宿主定期以 `refresh` 再次调用
- 用户点击按钮或拨动开关时，`action` 为该控件自身的 `id`
- `inputs` 为当前所有输入框与开关的值（字符串 / 布尔）

每次返回的描述整体替换上一份。状态由插件维护，渲染由宿主负责。

```js
return {
  title: "一起听", subtitle: "网易云音乐", icon: "group", refreshMs: 1500,
  body: [
    {type: "text", style: "title", center: true, text: "2 人正在一起听"},
    {type: "switch", id: "unlock", label: "音源解锁", desc: "灰色歌曲尝试其他来源", checked: true},
    {type: "input", id: "invitation", placeholder: "邀请链接或房间 ID"},
    {type: "row", items: [
      {type: "button", id: "create", label: "创建房间", style: "filled"},
      {type: "button", id: "join", label: "加入房间", style: "outlined"}
    ]}
  ]
};
```

| 节点 | 字段 |
|---|---|
| `text` | `text`（≤500）、`style`（`title`/`body`/`caption`）、`center` |
| `error` | `text`（≤300） |
| `input` | `id`、`placeholder`（≤60）、`value`（≤2048）、`secret` |
| `switch` | `id`、`label`（≤120）、`desc`（≤500）、`checked`、`enabled` |
| `button` | `id`、`label`（≤24）、`style`（`filled`/`outlined`/`text`）、`enabled`、`destructive` |
| `row` | `items`：1–3 个按钮，不可嵌套 |
| `spacer` | `height` 0–48 |

`title` ≤60，`subtitle` ≤120，`body` 最多 10 个节点。id 形如
`[a-z][a-z0-9._-]{0,63}`，`input` 与 `switch` 共用同一 id 空间且不能重名。

`switch` 既是输入也是动作：拨动时以自身 id 触发一次调用，新状态以布尔值出现在
`payload.inputs[id]` 中。开关类状态应使用该节点，宿主的渲染结果与自身设置项一致。

描述中没有颜色、图片、富文本和自由布局。宿主按白名单重建描述，未知附加字段会被丢弃；
未知节点类型、错误字段类型、越界值等会使描述失败。不要依赖附加字段改变渲染行为。

### 后台 tick

声明 `backgroundTimers` 后，在 `module.exports.handlers` 中定义
`backgroundTick: function (args) { ... }`，不必也不能将它加入 `capabilities`。
宿主约每秒调度，传入空对象并忽略返回值；上次 tick 未完成时跳过本次，不保证准确周期。
UI 关闭不停止 tick；停用、卸载或宿主退出会停止后续调度，这不是系统常驻服务保证。
房间协议、进度同步和轮询由插件负责。不要把 `backgroundTimers` 当作通用 JS 定时器 API。

---

## 九、打包、签名与发布

```text
plugin.json
src/main.js
META-INF/qplayer-files.json     # 每个文件的 SHA-256
META-INF/qplayer.sig            # 对上述文件原始字节的 P-256 ECDSA/SHA-256 签名(Base64 DER)
```

除哈希清单自身和签名外，包内每个文件都必须出现在哈希清单中。安装后每次启用都会重新
校验哈希，事后加入或修改的文件不会被执行。

未签名包可以手动导入，且不限开发用途。手动导入需要用户确认代码执行警告，
即使包带签名也不自动建立发布者信任。固定目录安装/更新必须通过条目固定公钥的签名检查：

```bash
QPLAYER_PLUGIN_SIGNING_KEY=/secure/path/publisher-private.pem ./scripts/package.sh
```

宿主目录为随包资源 `player-core/src/main/resources/dev/t1m3/qplayer/plugin/plugin-catalog.json`，
每条包含插件 ID、GitHub `repo` 和 `publisherKey` 等信息。宿主通过 `releases/latest`
读取版本，并选择首个 `.qplug` 资产；建议只附一个包。模板 tag 工作流强制
`v<plugin.json.version>`，这属于发布约定；安装时以签名清单的 ID 与版本为准。
目录更新需要宿主发布，插件版本更新在 ID、公钥和兼容要求不变时可独立进行。

已有宿主二进制仍使用其固定公钥。换钥签名的新包会被这些版本的目录安装/更新拒绝；
更新仓库公钥文件不能修改已发宿主。换钥需配合目录和宿主更新，而非声称密钥永远不能更换。
包内存在签名不代表它已被当前宿主信任。打包范围和模板工作流说明见 [README](../README.md#签名与发布)。

---

## 十、限额速查

| 项目 | 上限 |
|---|---|
| 单次 handler 调用 | 90 秒 |
| 单个 JS 模块 | 4 MiB |
| 返回值 | 深度 32 / 节点 50 万 / 累计字符串 24 Mi 个 UTF-16 代码单元 |
| `http.request` 请求体、响应体 | 各 16 MiB |
| HTTP 超时 | 1–30 秒，默认 10 秒 |
| 重定向 | 5 次 |
| `storage` 单条记录 | 1 MiB，含 key/value 的序列化 JSON |
| 原生 ID | 2048 字节 |
| 标题/名称类文本 | 4096 字符 |
| 简介类文本 | 1048576 个 UTF-16 代码单元 |
| 分页游标 | 8192 字符 |
| 搜索结果 | 每页 200 条 |
| 歌单曲目 | 20000 |
| 歌词 | 12 个 asset，每个 4 Mi 个 UTF-16 代码单元 |
| 弹窗 | 10 个节点 |
| UI 入口 | 8 个 |

---

## 十一、常见问题

- 插件返回的 URL 同样受网络授权约束。封面、播放地址、登录页、头像都必须位于
  `networkDomains` 内，否则封面被清空、播放地址报错。CDN 域名变更时需同步更新清单。
- 一次性播放地址应设置 `cacheable: false`，否则宿主会缓存已失效的 URL。
- `nextCursor` 不应返回 `"null"` 等非空占位值，任何非空字符串都表示仍有下一页。
- 没有名称的歌手或专辑条目会被丢弃而不是导致响应失败。真实歌单中存在这类数据
  （云盘上传、下架艺人），丢弃单个条目可以让整个歌单仍然可用。
- 不同接口对 `limit` 的处理不同。遵守传入的请求建议与各结构的硬上限；
  多数有界数组超出上限会失败，不要依赖宿主自动截断。
- handler 内应避免 CPU 密集循环。90 秒的超时覆盖整个调用，包括等待网络的时间。

调试时可用 `notifications.toast` 输出不含秘密的信息（需要 `notifications` 权限）。
`storage.put` 没有配套的开发者查看界面，也不是日志接口；不要向其中写入 Cookie 或 Token。
单次调用的超时、网络和返回数据限制也适用于调试代码。
