# QPlayer JavaScript plugin ABI 1.0

QPlayer 音源是用户单独安装的 `.qplug` 包，由隔离的 Rhino 引擎执行。
`plugin.json` 的 `apiVersion` 当前为 `1.0`，`minHostVersion` 可声明最低
QPlayer 版本。

## 身份格式

插件始终返回服务原生 ID，例如 `2668056312`。QPlayer 在插件边界将其转换为：

```text
<provider>:<kind>:<percent-encoded-native-id>
```

`kind` 可以是 `song`、`album`、`artist`、`playlist` 或 `user`。
插件只会收到属于自己的原生 ID，不应生成其他 provider 的规范 ID。

## 清单

```json
{
  "schemaVersion": 1,
  "id": "example",
  "name": "Example Source",
  "version": "1.0.0",
  "apiVersion": "1.0",
  "minHostVersion": "1.4.0",
  "entry": "src/main.js",
  "capabilities": ["searchSongs", "resolveStream", "lyrics"],
  "permissions": ["network"],
  "networkDomains": ["api.example.com", "*.cdn.example.com"],
  "networkMethods": ["GET", "POST"],
  "ui": []
}
```

可用权限包括 `network`、`clearTextNetwork`、`localNetwork`、`credentials`、
`webAuth`、`clipboard`、`openUrl`、`playbackRead`、`playbackControl`、
`queueWrite`、`notifications`、`customUi` 和 `backgroundTimers`。

登录能力必须声明 `credentials`；网络域名必须声明 `network`；自定义 QML
必须声明 `customUi`。路径必须是包内相对路径，不能包含 `..`、反斜杠、协议
或绝对路径。

## 运行时

入口使用 CommonJS 并导出 `handlers`。包内模块只能通过相对路径 `require()`：

```js
module.exports = {
  handlers: {
    searchSongs: function (args) {
      return qplayer.call("http.request", {
        url: "https://api.example.com/search?q=" + encodeURIComponent(args.query),
        method: "GET"
      }).then(function (response) {
        return {items: [], nextCursor: "", hasMore: false};
      });
    }
  }
};
```

handler 可以直接返回值或 Promise。每个插件使用一个串行 actor 线程，调用有
执行时间限制。插件无法访问 Java、`Packages`、任意文件、原生模块或 QPlayer
进程的共享 QML 上下文。

## 能力与同名 handler

| Capability | 主要参数与结果 |
|---|---|
| `searchSongs` | `{query,cursor,limit}` → 歌曲分页 |
| `searchAlbums`, `searchArtists` | 搜索专辑/歌手分页 |
| `hotSearch` | 热门关键词字符串数组 |
| `home` | `{limit}` → `{songs,playlists}` |
| `songDetails` | `{ids}` → 歌曲数组 |
| `playlistDetails` | `{id}` → 包含歌曲的歌单 |
| `artistDetails`, `albumDetails` | `{id}` → 详情及歌曲/专辑 |
| `recent`, `userPlaylists` | `{limit}` → 数组 |
| `resolveStream` | `{id,quality}` → URL、请求头、过期时间、试听/缓存策略 |
| `lyrics` | `{id}` → `lrc`、`yrc` 或 `ttml` 歌词资源 |
| `account` | 账户资料 |
| `login` | `methods`、`begin`、`poll`、`submit` 或 `logout` |
| `like` | `list` 或 `set` |
| `playlistMutation` | `add`、`remove`、`subscribe`、`delete` 或 `create` |
| `scrobble` | 播放报告 |
| `heartRecommendation` | 种子歌曲与可选歌单 → 歌曲 |
| `share` | 实体 → 分享 URL/文本 |
| `matchSong` | 元数据 → 匹配后的歌曲 |

QPlayer 会校验结果大小、实体 ID 所属、分页、歌词大小、请求头、播放/图片 URL
域名和枚举值。只声明已经完整实现的能力。一起听等平台专属功能不属于宿主
capability，应由插件自己的界面 handler 与后台 handler 完整实现。

## 主机调用

`qplayer.call(method, args)` 始终返回 Promise：

| 方法族 | 权限 | 说明 |
|---|---|---|
| `storage.get/put/delete` | 无 | 插件独立命名空间，单值有大小限制 |
| `credentials.get/put/delete` | `credentials` | 加密且按插件/键隔离 |
| `http.request` | `network` | 域名、方法、DNS、重定向与响应大小受限 |
| `crypto.*` | 无 | 摘要、随机数、AES、HMAC、模幂、X25519 |
| `compression.gunzip` | 无 | 有大小上限的解压 |
| `playback.read` | `playbackRead` | 当前歌曲、队列、播放时钟、切换状态与变更版本 |
| `playback.play/pause/seek/select/next/blockAutoAdvance` | `playbackControl` | 与音源无关的播放控制 |
| `queue.replace` | `queueWrite` | 校验 Song DTO 后替换队列 |
| `notifications.toast` | `notifications` | 显示宿主 Toast/Snackbar |
| `clipboard.write` | `clipboard` | 写入系统剪贴板 |

返回给 QPlayer 的播放、封面等 URL 会再次检查域名授权。

## 登录、自定义界面与签名

插件可以通过 `login` 提供二维码、系统 WebView 和粘贴凭据方式。凭据必须用
`credentials.*` 保存，退出登录时应删除对应键。

自定义界面需要 `customUi`，并在 `ui` 中声明：

```json
{"id":"preferences","placement":"settings","source":"ui/Preferences.qml",
 "label":"插件设置","icon":"tune"}
```

`settings` 会出现在插件独立设置页；`playerAction` 会按清单中的 `label` 和
`icon` 出现在手机顶部栏与桌面/平板导航栏。QPlayer 只负责入口和隔离窗口，
不知道该功能的业务含义。

该 QML 在独立安全 Realm 中运行，只能访问 `plugin.call(action,payloadJson)`，
不能访问 `player`、设置、Java、文件系统或宿主窗口对象。

声明 `backgroundTimers` 后可以导出 `backgroundTick`。QPlayer 约每秒调用一次，
同一插件的 tick 不会重入，插件停用或移除后立即停止。房间协议、主控权、进度
同步和通知等策略应保留在插件中，只通过上述通用播放接口影响宿主。

包内除 `META-INF/qplayer-files.json` 和可选签名外的每个文件都必须出现在
哈希清单中。`META-INF/qplayer.sig` 是对哈希清单原始字节的 P-256
ECDSA/SHA-256 签名（Base64 DER）。模板脚本会自动生成这些文件。
