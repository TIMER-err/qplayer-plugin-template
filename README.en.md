# QPlayer source plugin template

<p><a href="README.md">简体中文</a> · <b>English</b></p>

A working skeleton for a QPlayer music source plugin. Clone it, change the manifest
fields, implement your handlers, and you have a `.qplug` package that installs into
QPlayer.

QPlayer itself contains no online music source and distributes no source code for
one. Search, playlists, stream URLs, lyrics and login all come from a plugin the
user installs. Plugins run in an isolated Rhino realm, and only permissions declared
in the manifest and confirmed by the user at install time take effect. The template
manifest is therefore minimal; extend it as needed.

## Build and import

```bash
chmod +x scripts/package.sh
./scripts/package.sh
python3 scripts/verify-package.py dist/*.qplug
```

Then, in QPlayer, choose **Settings → Source plugins → Import plugin package** and
select the generated `.qplug`.

The default example declares only `searchSongs` and returns a valid empty page, so
it requires no permissions and can be installed and enabled as is. This verifies the
packaging, import and activation path before any real logic is written.

## Next steps

1. In `plugin.json`, set `id`, `name`, `version` and `capabilities`. The `id` becomes
   the prefix of every media id and should not change afterwards.
2. In `src/main.js`, implement a same-named handler for every declared capability.
   Declaring one without implementing it causes the plugin to refuse activation, so
   the UI never shows an entry that does nothing.
3. For network access, add the `network` permission and list exact hosts in
   `networkDomains`:

```js
qplayer.call("http.request", {
  url: "https://api.example.com/search?q=" + encodeURIComponent(args.query),
  method: "GET"
}).then(function (response) {
  return {items: JSON.parse(response.body).songs.map(toSongDto), nextCursor: ""};
});
```

`networkDomains` governs both requests and the URLs a plugin returns: covers, stream
URLs, avatars and login pages outside the granted domains are cleared or rejected.
Update the manifest when a CDN changes.

The full capability list, data shapes, login flow, host calls, dialog schema and all
limits are documented in the [plugin ABI 1.0](docs/ABI.en.md).

## Signing and releasing

Unsigned packages can only be imported manually, and QPlayer shows a code-execution
warning every time. Public distribution requires a P-256 publisher key that stays
out of the repository:

```bash
QPLAYER_PLUGIN_SIGNING_KEY=/secure/path/publisher-private.pem ./scripts/package.sh
```

`scripts/package.sh` records every file under `plugin.json`, `src/` and an optional
`assets/` in `META-INF/qplayer-files.json`, adds `META-INF/qplayer.sig` when a key is
supplied, and writes `dist/<id>-<version>.qplug`.

Generate the publisher key once, before the first release:

```bash
openssl ecparam -name prime256v1 -genkey -noout -out publisher-private.pem
gh secret set QPLAYER_PLUGIN_SIGNING_KEY < publisher-private.pem
openssl ec -in publisher-private.pem -pubout -outform DER \
  | openssl base64 -A > publisher-key.pub
```

After the private key is stored in the Actions secret, move it to offline backup
rather than leaving it in the working tree. `publisher-key.pub` is the public half
and should be committed: QPlayer pins one copy, and the release workflow uses the
other to verify the signing key has not been replaced.

> A publisher key cannot be rotated. The public key is compiled into the QPlayer
> binary, so changing it prevents every already-released QPlayer from installing the
> plugin until QPlayer itself ships a new version. The workflow's "Match the pinned
> publisher key" step blocks this before signing.

Pushing a tag triggers a release: the workflow signs, verifies and creates the GitHub
Release, while branches and pull requests only build unsigned development packages.

```bash
git tag v0.1.0
git push origin v0.1.0
```

QPlayer reads the repository's latest release, so three conditions must hold: the tag
equals `v<version from plugin.json>`, the release carries exactly one `.qplug`, and
it is a normal release rather than a draft or pre-release (GitHub's
`releases/latest` skips both). Once they hold, new plugin versions require no change
in QPlayer.

## Conventions

- Cookies, tokens and private keys should not appear in source, test fixtures, logs
  or releases. Login credentials are stored only through `credentials.*`, which is
  AES-GCM encrypted and namespaced per plugin.
- Request only the permissions and domains actually used; they are shown verbatim to
  the user at install time.
- Terms of service, content licensing and local law are the responsibility of the
  plugin author and the user.
- To be listed as a built-in source: maintain your own repository, publish signed
  packages as above, and submit an entry to QPlayer containing your `owner/repo` and
  the contents of `publisher-key.pub` (`PluginCatalogService.SOURCES`). Listed
  plugins still release on their own schedule; QPlayer bundles and hosts no plugin
  code or packages.

This template is MIT licensed. Repositories generated from it may choose their own
license.
