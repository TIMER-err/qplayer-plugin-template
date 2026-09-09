# QPlayer 音源插件模板

<p><b>简体中文</b> · <a href="README.en.md">English</a></p>

一个可直接运行的 QPlayer 音源插件骨架。克隆后修改清单字段、实现自己的 handler，
即可得到可安装进 QPlayer 的 `.qplug` 包。

QPlayer 本体不包含在线音源，也不分发音源代码。搜索、歌单、播放地址、歌词、登录均由
用户自行安装的插件提供。插件运行在隔离的 Rhino Realm 中，只有清单中声明、且用户在
安装时确认过的权限才会生效。模板的默认清单因此保持最小，按需添加。

## 构建与导入

```bash
chmod +x scripts/package.sh
./scripts/package.sh
python3 scripts/verify-package.py dist/*.qplug
```

然后在 QPlayer 中「设置 → 音源插件 → 导入插件包」选择生成的 `.qplug`。

默认示例只声明 `searchSongs`，返回一个合法的空分页，不需要任何权限，可以直接安装并
启用。这一步用于先验证打包、导入与启用流程，再实现具体业务。

## 下一步

1. 在 `plugin.json` 中修改 `id`、`name`、`version` 和 `capabilities`。`id` 会成为所有
   媒体 ID 的前缀，确定后不应再更改。
2. 在 `src/main.js` 中为每个声明的 capability 实现同名 handler。声明而未实现会导致
   插件拒绝启用，以避免界面上出现无响应的入口。
3. 需要联网时添加 `network` 权限，并在 `networkDomains` 中列出精确域名：

```js
qplayer.call("http.request", {
  url: "https://api.example.com/search?q=" + encodeURIComponent(args.query),
  method: "GET"
}).then(function (response) {
  return {items: JSON.parse(response.body).songs.map(toSongDto), nextCursor: ""};
});
```

`networkDomains` 不仅约束请求，也约束插件返回的 URL：封面、播放地址、头像、登录页
不在授权域名内会被清空或拒绝。CDN 域名变更时需同步更新清单。

完整的能力清单、数据结构、登录流程、主机接口、弹窗 schema 与各项限额见
[插件 ABI 1.0](docs/ABI.md)。

## 签名与发布

未签名的包只能手动导入，QPlayer 每次都会显示代码执行警告。公开分发需使用 P-256
发布者私钥签名，私钥不进入仓库：

```bash
QPLAYER_PLUGIN_SIGNING_KEY=/secure/path/publisher-private.pem ./scripts/package.sh
```

`scripts/package.sh` 会把 `plugin.json`、`src/` 和可选的 `assets/` 中每个文件写入
`META-INF/qplayer-files.json`，提供私钥时再写入 `META-INF/qplayer.sig`，产物为
`dist/<id>-<version>.qplug`。

首次发布前生成一对发布者密钥：

```bash
openssl ecparam -name prime256v1 -genkey -noout -out publisher-private.pem
gh secret set QPLAYER_PLUGIN_SIGNING_KEY < publisher-private.pem
openssl ec -in publisher-private.pem -pubout -outform DER \
  | openssl base64 -A > publisher-key.pub
```

私钥写入 Actions Secret 后应移至离线备份，不应留在工作目录。`publisher-key.pub` 是
公钥，需要提交：一份供 QPlayer 固定，一份供发布流程在签名前核对私钥未被更换。

> 发布者密钥无法更换。公钥编译在 QPlayer 二进制中，更换密钥会使所有已发布版本的
> QPlayer 无法安装该插件，直到 QPlayer 发布新版本。工作流中的 "Match the pinned
> publisher key" 步骤用于在签名前拦截这种情况。

推送 tag 即触发发布：工作流会签名、校验并创建 Release；普通分支与 Pull Request 只
构建未签名的开发包。

```bash
git tag v0.1.0
git push origin v0.1.0
```

QPlayer 读取仓库的 latest release，因此发布需满足三个条件：tag 等于
`v<plugin.json 中的 version>`、Release 中恰好挂载一个 `.qplug`、且不是草稿或预发布
（GitHub 的 `releases/latest` 会跳过这两类）。满足后，插件发新版本不需要 QPlayer 做
任何改动。

## 约定

- Cookie、Token、私钥不应出现在源码、测试数据、日志和 Release 中。登录凭据只通过
  `credentials.*` 存储，该接口为 AES-GCM 加密并按插件隔离。
- 只申请实际使用的权限和域名。这些内容会在安装时原样展示给用户。
- 音源服务的使用条件、内容授权和当地法律由插件作者与用户自行确认。
- 如需进入 QPlayer 的内置音源列表：自行维护仓库、按上述方式发布签名包，并向 QPlayer
  提交一条包含 `owner/repo` 与 `publisher-key.pub` 内容的条目
  （`PluginCatalogService.SOURCES`）。收录后插件仍按自身节奏发版，QPlayer 不捆绑也不
  托管插件代码或包。

本模板使用 MIT 许可证，由模板生成的仓库可自行选择许可证。
