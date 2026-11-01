# QPlayer 音源插件模板

<p><b>简体中文</b> · <a href="README.en.md">English</a></p>

一个最小的 QPlayer 音源插件示例。克隆后修改清单字段、实现自己的 handler，
即可打包为可安装进 QPlayer 的 `.qplug`。

QPlayer 本体不包含在线音源，也不分发音源代码。搜索、歌单、播放地址、歌词、登录均由
用户自行安装的插件提供。插件运行在隔离的 Rhino Realm 中，只有清单中声明、且用户在
安装时确认过的权限才会生效。模板的默认清单因此保持最小，按需添加。

## 构建与导入

需要 Bash、Python 3 和提供 `jar` 命令的 JDK（建议与宿主开发环境一致，使用 JDK 21）。
签名还需要 OpenSSL。Windows 可使用提供这些命令的 Bash 环境。

```bash
chmod +x scripts/package.sh
./scripts/package.sh
python3 scripts/verify-package.py dist/*.qplug
```

然后在 QPlayer 中「设置 → 音源插件 → 导入插件包」选择生成的 `.qplug`。

默认示例只声明 `searchSongs`，返回一个合法的空分页，不需要任何权限，可以直接安装并
启用。这一步用于先验证打包、导入与启用流程，再实现具体业务。

接口参考以 QPlayer **1.9.7** 实现为基线，`apiVersion` 仍为 **1.0**。默认空搜索示例
保留 `minHostVersion: "1.4.0"`；这不表示完整参考中的新接口均可用于 1.4.0。
使用新功能时，应按实际验证过的最低宿主版本调整清单，不要只依据 `apiVersion` 判断。

## 下一步

1. 在 `plugin.json` 中修改 `id`、`name`、`version` 和 `capabilities`。`id` 会成为所有
   媒体 ID 的前缀，确定后不应再更改。
2. 在 `src/main.js` 中为每个声明的 capability 实现同名 handler。声明而未实现会导致
   插件拒绝启用，以避免界面上出现无响应的入口。
3. 需要联网时添加 `network` 权限，并在 `networkDomains` 中列出精确域名。
   以下是完整的 `searchSongs` handler 示例，不包含真实音源。它假定你自己的 API 返回
   `{songs: [{id, title, durationMs}], nextCursor: ""}`，并按请求的 `limit` 分页：

```js
module.exports = {
  handlers: {
    searchSongs: function (args) {
      return qplayer.call("http.request", {
        url: "https://api.example.com/search?q=" + encodeURIComponent(args.query)
          + "&cursor=" + encodeURIComponent(args.cursor || "")
          + "&limit=" + args.limit,
        method: "GET"
      }).then(function (response) {
        if (response.status !== 200) throw new Error("Search HTTP " + response.status);
        var data = JSON.parse(response.body);
        return {
          items: data.songs.map(function (song) {
            return {id: String(song.id), title: String(song.title),
              durationMs: Number(song.durationMs || 0)};
          }),
          nextCursor: data.nextCursor ? String(data.nextCursor) : ""
        };
      });
    }
  }
};
```

`networkDomains` 不仅约束请求，也约束插件返回的 URL：封面、播放地址、头像、登录页
不在授权域名内会被清空或拒绝。CDN 域名变更时需同步更新清单。

完整的能力清单、数据结构、登录流程、主机接口、弹窗 schema 与各项限额见
[插件 ABI 1.0](docs/ABI.md)。

## 签名与发布

手动导入允许未签名包，宿主要求用户确认代码执行警告；这不局限于开发用途。
手动导入也不会仅因包内存在签名就建立发布者信任。内置固定目录来源的安装和更新则
必须匹配该条目固定的 P-256 发布者公钥。模板的 tag 发布工作流也要求签名：

```bash
QPLAYER_PLUGIN_SIGNING_KEY=/secure/path/publisher-private.pem ./scripts/package.sh
```

`scripts/package.sh` 只复制 `plugin.json`、`src/` 及可选的 `ui/`、`assets/`，
并把这些文件的哈希写入 `META-INF/qplayer-files.json`。提供私钥时再写入
`META-INF/qplayer.sig`，产物为 `dist/<id>-<version>.qplug`。其他目录不会自动打包。
`ui/` 只是包内资源目录；宿主不会执行插件 QML。
`verify-package.py` 检查路径、哈希覆盖和入口，不验证签名、清单权限或 handler 运行行为；
这些仍需由宿主检查。

首次发布前生成一对发布者密钥：

```bash
openssl ecparam -name prime256v1 -genkey -noout -out publisher-private.pem
gh secret set QPLAYER_PLUGIN_SIGNING_KEY < publisher-private.pem
openssl ec -in publisher-private.pem -pubout -outform DER \
  | openssl base64 -A > publisher-key.pub
```

私钥写入 Actions Secret 后应移至离线备份，不应留在工作目录。`publisher-key.pub` 是
公钥，需要提交：一份供 QPlayer 固定，一份供发布流程在签名前核对私钥未被更换。

> 已发宿主版本保留其编译时固定的公钥。若改用另一把私钥签名，这些版本的固定目录
> 安装和更新会拒绝新包；更新仓库中的公钥文件不能改变已发二进制。
> 密钥调整需要配合宿主目录更新及新宿主版本，仍需考虑旧版本用户。
> 工作流的 "Match the pinned publisher key" 在公钥文件存在时检查私钥是否匹配。

推送 tag 即触发发布：工作流会签名、校验并创建 Release；普通分支与 Pull Request 只
构建未签名的开发包。

```bash
git tag v0.1.0
git push origin v0.1.0
```

QPlayer 从固定目录条目对应仓库的 `releases/latest` 读取版本；草稿和预发布不会由此
接口返回。模板工作流要求 tag 为 `v<plugin.json 中的 version>`，建议每个 Release
只挂载一个 `.qplug`。当前宿主选择首个 `.qplug` 资产，最终信任签名清单中的插件 ID
和版本，而不把 tag 当作签名依据。保持目录条目的 ID、公钥与兼容要求后，插件更新
通常不需要 QPlayer 同步发版。

## 约定

- Cookie、Token、私钥不应出现在源码、测试数据、日志和 Release 中。登录凭据只通过
  `credentials.*` 存储，该接口为 AES-GCM 加密并按插件隔离。
- 只申请实际使用的权限和域名。这些内容会在安装时原样展示给用户。
- 音源服务的使用条件、内容授权和当地法律由插件作者与用户自行确认。
- 如需进入 QPlayer 的内置音源列表：自行维护仓库、发布签名包，并向 QPlayer 的
  `player-core/src/main/resources/dev/t1m3/qplayer/plugin/plugin-catalog.json`
  提交条目，包含 `id`、`name`、`description`、`repo`（`owner/repo`）和
  `publisherKey`（`publisher-key.pub` 内容）。收录后插件仍独立发版；
  QPlayer 不捆绑也不托管插件代码或包。

本模板使用 MIT 许可证，由模板生成的仓库可自行选择许可证。
