# QPlayer source plugin template

<p><a href="README.md">简体中文</a> · <b>English</b></p>

A minimal QPlayer music source plugin example. Clone it, change the manifest fields,
and implement your handlers to produce an installable `.qplug` package.

QPlayer itself contains no online music source and distributes no source code for
one. Search, playlists, stream URLs, lyrics and login all come from a plugin the
user installs. Plugins run in an isolated Rhino realm, and only permissions declared
in the manifest and confirmed by the user at install time take effect. The template
manifest is therefore minimal; extend it as needed.

## Build and import

Use Bash, Python 3, and a JDK that supplies `jar` (JDK 21 is recommended, matching
the host development environment). Signing also requires OpenSSL. On Windows, use
a Bash environment that supplies these commands.

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

The reference follows QPlayer **1.9.6**; `apiVersion` remains **1.0**. The empty
search example keeps `minHostVersion: "1.4.0"`. This does not make every interface
in the reference available on 1.4.0. Set the minimum host version to the oldest
version you actually verified for the features you use, not from `apiVersion` alone.

## Next steps

1. In `plugin.json`, set `id`, `name`, `version` and `capabilities`. The `id` becomes
   the prefix of every media id and should not change afterwards.
2. In `src/main.js`, implement a same-named handler for every declared capability.
   Declaring one without implementing it causes the plugin to refuse activation, so
   the UI never shows an entry that does nothing.
3. For network access, add `network` and list exact hosts in `networkDomains`.
   This complete `searchSongs` handler does not supply a real source. It assumes
   your API returns `{songs: [{id, title, durationMs}], nextCursor: ""}` and
   paginates according to the requested `limit`:

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

`networkDomains` governs both requests and the URLs a plugin returns: covers, stream
URLs, avatars and login pages outside the granted domains are cleared or rejected.
Update the manifest when a CDN changes.

The full capability list, data shapes, login flow, host calls, dialog schema and all
limits are documented in the [plugin ABI 1.0](docs/ABI.en.md).

## Signing and releasing

Manual import accepts unsigned packages after a code-execution warning; this is not
limited to development. A signature inside a manually imported package does not
establish publisher trust by itself. Installation and updates from the built-in
catalog require the P-256 key pinned to that entry. The template's tag release
workflow also requires signing:

```bash
QPLAYER_PLUGIN_SIGNING_KEY=/secure/path/publisher-private.pem ./scripts/package.sh
```

`scripts/package.sh` copies only `plugin.json`, `src/`, and optional `ui/` and
`assets/` directories. It records their hashes in `META-INF/qplayer-files.json`,
adds `META-INF/qplayer.sig` when a key is supplied, and writes
`dist/<id>-<version>.qplug`. Other directories are not packaged automatically.
`ui/` is only a resource directory; the host does not execute plugin QML.
`verify-package.py` checks paths, hash coverage, and the entry file. It does not
check signatures, manifest permissions, or handler behavior; the host must check those.

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

> Released hosts retain the public key compiled into them. Packages signed with a
> different key fail catalog installation and updates on those hosts. Changing a
> public-key file in the repository cannot change released binaries. Key changes
> require a catalog update and a host release, with a plan for older hosts.
> "Match the pinned publisher key" checks the private key when the public-key file exists.

Pushing a tag triggers a release: the workflow signs, verifies and creates the GitHub
Release, while branches and pull requests only build unsigned development packages.

```bash
git tag v0.1.0
git push origin v0.1.0
```

QPlayer reads `releases/latest` for the repository in the pinned catalog entry;
that endpoint excludes drafts and pre-releases. The template workflow requires
`v<version from plugin.json>` as the tag. Attach one `.qplug` per release to avoid
ambiguity: the current host selects the first matching asset. The signed manifest's
plugin ID and version are authoritative, not the tag. Plugin updates normally do
not require a host release if the pinned ID, key, and compatibility requirements stay valid.

## Conventions

- Cookies, tokens and private keys should not appear in source, test fixtures, logs
  or releases. Login credentials are stored only through `credentials.*`, which is
  AES-GCM encrypted and namespaced per plugin.
- Request only the permissions and domains actually used; they are shown verbatim to
  the user at install time.
- Terms of service, content licensing and local law are the responsibility of the
  plugin author and the user.
- To enter the built-in catalog, maintain your repository, publish signed packages,
  and submit an entry to QPlayer's
  `player-core/src/main/resources/dev/t1m3/qplayer/plugin/plugin-catalog.json`.
  Include `id`, `name`, `description`, `repo` (`owner/repo`), and `publisherKey`
  (the contents of `publisher-key.pub`). Listed plugins release independently;
  QPlayer bundles and hosts no plugin code or packages.

This template is MIT licensed. Repositories generated from it may choose their own
license.
