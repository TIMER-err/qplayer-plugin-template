# QPlayer source plugin template

用于创建独立 QPlayer JavaScript 音源插件的最小模板。插件运行在隔离的
Rhino Realm 中，只能使用清单中声明并由用户确认的权限；QPlayer 核心不会
替插件提供或隐式开放任何音源接口。

## 开始开发

1. 在 `plugin.json` 中修改 `id`、名称、版本、作者和能力列表。
2. 在 `src/main.js` 中实现所有已声明能力的同名 handler。
3. 仅申请实际使用的权限、HTTPS 域名和 HTTP 方法。
4. 构建并在 QPlayer 的“设置 → 插件 → 导入音源插件”中测试。

```bash
chmod +x scripts/package.sh
./scripts/package.sh
python3 scripts/verify-package.py dist/*.qplug
```

默认示例只声明 `searchSongs`，返回一个合法的空分页，因此不需要网络权限，
可以直接打包、导入并启用。接入真实服务时，可通过：

```js
qplayer.call("http.request", {
  url: "https://api.example.com/search?q=" + encodeURIComponent(args.query),
  method: "GET"
})
```

发起受策略限制的异步请求。相应地，需要在 `plugin.json` 中加入 `network`
权限、精确的 `networkDomains` 和 `networkMethods`。

完整 ABI、数据结构、登录、凭据、歌词、播放地址、一起听和可选 QML 扩展说明：
[QPlayer 插件 ABI 1.0](docs/ABI.md)。

## 包签名

手动测试可以导入未签名包，QPlayer 会显示强制代码执行警告。公开分发应使用
独立保存的 P-256 私钥签名，私钥不得提交到仓库：

```bash
QPLAYER_PLUGIN_SIGNING_KEY=/secure/path/publisher-private.pem ./scripts/package.sh
```

`scripts/package.sh` 会覆盖 `plugin.json`、`src/`、可选的 `ui/` 与 `assets/`
中的每个文件，生成 `META-INF/qplayer-files.json`，并在提供私钥时写入
`META-INF/qplayer.sig`。输出文件位于 `dist/<id>-<version>.qplug`。

首次发布前生成独立的 P-256 发布者密钥，并把私钥写入仓库 Actions Secret；
私钥文件随后应移至安全的离线备份位置，不要提交：

```bash
openssl ecparam -name prime256v1 -genkey -noout -out publisher-private.pem
gh secret set QPLAYER_PLUGIN_SIGNING_KEY < publisher-private.pem
openssl ec -in publisher-private.pem -pubout -outform DER \
  | openssl base64 -A > publisher-key.pub
```

`publisher-key.pub` 是公钥，应当提交。它有两个用途：交给 QPlayer 固定在程序内，
以及让发布工作流在签名前核对私钥没有被换掉。

**发布者密钥一旦被 QPlayer 固定就不能更换。** QPlayer 把公钥编译进自己的二进制，
换密钥会让所有已发布的 QPlayer 都无法安装本插件，直到 QPlayer 自己发新版本。
工作流中的“Match the pinned publisher key”步骤会在签名前拦住这种情况。

模板工作流会在推送与 `plugin.json` 版本一致的标签时自动签名、校验并创建
GitHub Release，普通分支与 Pull Request 仍只构建未签名开发包：

```bash
git tag v0.1.0
git push origin v0.1.0
```

QPlayer 直接读取本仓库 GitHub 的**最新 Release** 来决定可安装的版本，因此发布必须
满足：标签为 `v<plugin.json 的 version>`、Release 附件中恰好有一个 `.qplug`，且不是
草稿或预发布（GitHub 的 `releases/latest` 会跳过这两类）。满足这些条件时，插件发新版
不需要 QPlayer 做任何改动。

## 安全与发布

- 不要在源码、测试数据、日志或 Release 中提交 Cookie、Token、私钥。
- 登录凭据只能通过 `credentials.*` 接口存储。
- 不要请求与实际功能无关的权限或过宽域名。
- 音源服务的使用条件、内容授权和当地法律由插件作者与用户自行确认。
- 若希望成为 QPlayer 的内置源，需要单独维护插件仓库、发布签名包，并向 QPlayer
  提交一条包含 `owner/repo` 与 `publisher-key.pub` 内容的条目（`PluginCatalogService.SOURCES`）。
  收录之后插件自行发版即可，QPlayer 不捆绑插件代码或包。

本模板使用 MIT 许可证。由模板生成的仓库可以自行选择许可证。
