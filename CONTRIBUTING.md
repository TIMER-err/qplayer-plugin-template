# Contributing

需要 Bash、Python 3 和提供 `jar` 的 JDK（建议 JDK 21）；签名还需要 OpenSSL。
提交更改前请运行：

```bash
./scripts/package.sh
python3 scripts/verify-package.py dist/*.qplug
```

新增 capability 时必须同时实现同名 handler；只申请实际使用的权限与域名。
`ui.<id>` 和 `backgroundTick` 放在 `handlers`，不是 capability。
默认模板保留无权限的空 `searchSongs` 分页，不向示例添加登录、播放或虚构音源。

同步修改中英文 README 与 ABI。当前完整参考以宿主 1.9.6 为基线，`apiVersion` 仍为 1.0；
新增功能按实际最低兼容宿主设置 `minHostVersion`，不要仅因文档基线更新就抬高最小示例版本。
以宿主 `PluginProviderService`、`CorePluginHostApi`、`PluginAccountService`、
`PluginUiDescription` 和 `PlayerController` 的实际参数、权限与消费逻辑为准。
区分插件边界与本地文件解析能力，也区分历史兼容字段与已路由接口。

打包脚本只复制 `plugin.json`、`src/`、可选 `ui/` 与 `assets/`；其他目录需先明确打包策略。
`verify-package.py` 只检查归档路径、哈希与入口，不验证签名或插件行为。
还需在对应最低宿主和当前宿主手动导入、确认警告、启用，再验证更改涉及的实际功能。
手动导入不建立固定目录的发布者信任；目录签名须由宿主用固定公钥检查。

不要提交 `dist/`、发布私钥、账号凭据或服务端秘密。日志与调试示例也不得包含这些信息。
