# QPlayer plugin ABI 1.0

<p><a href="ABI.md">简体中文</a> · <b>English</b></p>

This reference follows the implementation in **QPlayer 1.9.6**. `schemaVersion`
is `1` and `apiVersion` remains `1.0`; not every 1.0 host supplies every feature.
Compatibility checks require the same API major version, no newer requested minor
version, and a host that meets the optional `minHostVersion`. Set that minimum for
the features and host versions you actually verify. This reference does not guess
unknown introduction versions. The default empty search example keeps `1.4.0`.

QPlayer contains no online source. Installed `.qplug` packages supply search,
playlists, streams, lyrics, and login. The host validates defined fields and renders
results; unknown extra fields do not necessarily fail and must not be relied on.

Unless a limit explicitly says bytes, string lengths use Java `String.length()`:
UTF-16 code units, not UTF-8 bytes. MiB means 1024 × 1024 bytes.

---

## 1. Runtime

A plugin is CommonJS JavaScript running on the embedded Rhino engine, one realm per
plugin. It has no access to Java classes, `Packages`, the filesystem, other plugins'
data, or QPlayer's QML scene. The only external interface is the global `qplayer`
object.

Each plugin has one actor thread that serializes JavaScript execution. Maintain
business state across asynchronous waits. The default call timeout is **90 seconds**,
including time spent waiting for host calls.

The default example needs no permissions:

```js
module.exports = {
  handlers: {
    searchSongs: function (args) {
      return {items: [], nextCursor: ""};
    }
  }
};
```

See the [README](../README.en.md#next-steps) for a complete network search mapping.
Its example endpoint is not a built-in source.

A handler may return a value or a Promise. `require()` loads only relative `.js`
files inside the verified package, 4 MiB per module.

Every capability declared in the manifest must be implemented. At startup the host
checks `handlers[capability]` one by one and refuses activation if any is missing,
so the UI never shows an entry that does nothing.

---

## 2. `plugin.json`

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

| Field | Notes |
|---|---|
| `schemaVersion` | always `1` |
| `id` | plugin/source id, also the prefix of every media id. `local` is reserved |
| `name` | display name, ≤80 chars |
| `version` | plugin version; the release tag must match it |
| `apiVersion` | currently `1.0` |
| `minHostVersion` | optional; older QPlayer builds refuse to install |
| `entry` | entry script, package-relative |
| `capabilities` | see section 4; declare only what is implemented |
| `permissions` | see below; declare only what is used |
| `networkDomains` | exact host or `*.example.com`; requires the `network` permission |
| `networkMethods` | subset of `GET`/`POST`/`PUT`/`PATCH`/`DELETE`/`HEAD`; empty means `["GET","POST"]` |
| `ui` | declarative dialog entries, at most 8, see section 8 |

All paths are package-relative and may not contain `..`, backslashes, schemes or
absolute segments.

`1.9.6` is the baseline for this reference example, not the introduction version of
every capability. `publisher` is publisher text; `icon` is an optional package
resource path. `ui[].source` is accepted for historical compatibility but is not
executed. Unlike manifest resource paths, relative `require()` paths may use `./module.js`.

### Permissions

| Permission | Grants |
|---|---|
| `network` | calling `http.request` and returning http(s) URLs |
| `clearTextNetwork` | plain `http://` access |
| `localNetwork` | private/loopback addresses, otherwise refused after DNS resolution |
| `credentials` | the encrypted vault; required by `login` |
| `webAuth` | web login and bounded system-WebView script execution |
| `clipboard` | writing the system clipboard |
| `openUrl` | retained permission; no usable `openUrl.*` host method is currently implemented |
| `playbackRead` | reading the current playback state |
| `playbackControl` | play, pause, seek, skip |
| `queueWrite` | replacing the playback queue |
| `notifications` | host toast/snackbar |
| `customUi` | declarative dialog entries |
| `backgroundTimers` | exporting `backgroundTick`, called about once a second |
| `files.save` | calling `files.save` and `files.downloadCurrent`, see section 7 |

The installer lists permissions for user confirmation. Permissions do not imply
other permissions: `webAuth` and `files.save` do not grant `network`. Returned
network URLs still require `network` and a domain grant.

---

## 3. Media identity

A plugin only handles the service's own native ids, e.g. `2668056312`. The host
produces the globally unique form:

```text
<provider>:<kind>:<percent-encoded native id>
```

`kind` is one of `song`, `album`, `artist`, `playlist`, `user`. Native ids are
limited to 2048 bytes and may not contain control characters.

A plugin only receives ids that belong to it and must not construct another
provider's canonical id. Queues, caches, playlist context and navigation are all
based on canonical ids, and an invalid one causes the host to throw.

---

## 4. Capabilities and handlers

Each capability maps to a same-named handler, grouped here by purpose.

### Search

| handler | arguments | result |
|---|---|---|
| `searchSongs` | `{query, cursor, limit}`, limit 1–100 | `{items: Song[], nextCursor}`, ≤200 items |
| `searchAlbums` | same | `{items: Album[], nextCursor}` |
| `searchArtists` | same | `{items: Artist[], nextCursor}` |
| `hotSearch` | `{}` | array of strings, first 50 kept |

The cursor is opaque to the host: an offset, a page number or a server token,
≤8192 chars. Return an empty string when there is no next page.

The host reads `items` and `nextCursor`, not extra fields such as `hasMore`, `total`,
or page numbers. Any nonempty cursor means another page exists. `limit` is the
requested size; the parser's hard cap is 200 items. Exceeding that cap fails the
response; the parser does not promise to truncate to the requested `limit`.

### Details

| handler | arguments | result |
|---|---|---|
| `songDetails` | `{ids: string[]}`, ≤500 | `Song[]` |
| `playlistDetails` | `{id}` | `Playlist`, `songs` ≤20000 |
| `albumDetails` | `{id}` | `Album`, `songs` ≤5000 |
| `artistDetails` | `{id}` | `Artist`, `songs`/`albums` ≤1000 each |

### Home and personal content

| handler | arguments | result |
|---|---|---|
| `home` | `{limit}` | `{songs, playlists, sections}` |
| `home` | `{operation: "recommendSongs"}` | `Song[]`, an array rather than an object |
| `recent` | `{limit}`, 1–500 | `Song[]` |
| `userPlaylists` | `{limit}`, 1–500 | `Playlist[]` |

One handler serves two calls, distinguished by `operation`: without it the host
requests home content; with `operation` set to `recommendSongs` it requests a daily
mix style song list.

The three parts of `home`:

- `songs` (≤100) — recommended tracks.
- `playlists` (≤100) — the recommendation grid. `limit` bounds only this list and
  comes from the user's home-page setting.
- `sections` (≤6 groups of ≤30 playlists) — titled groups drawn above the grid,
  shaped `{title, playlists}`. Intended for lists the source itself names as a
  section, such as NetEase's radar or scenario playlists. Empty groups are dropped.

### Playback and lyrics

| handler | arguments | result |
|---|---|---|
| `resolveStream` | `{id, quality}` | see below |
| `lyrics` | `{id}` | `{assets: [...]}` |
| `scrobble` | `{id, playedMs, durationMs, completed}` | ignored by the host |
| `heartRecommendation` | `{songId, playlistId, limit}` | `Song[]` |

`resolveStream` returns:

```js
{
  url: "https://...",          // required, must be inside the granted domains
  headers: {"Referer": "..."}, // optional, ≤64, values ≤8192 chars, no newlines
  mimeType: "audio/mpeg",      // optional
  expiresAtMs: 1700000000000,  // optional expiry timestamp metadata for caching
  trial: false,                // preview clip
  cacheable: true,             // default true; set false for one-shot URLs
  renditionId: "1234"          // optional, when the served track differs
}
```

The `Host`, `Content-Length` and `Connection` request headers are dropped.

The host supplies `quality`. Current playback/download paths use values such as
`standard`, `higher`, `exhigh`, `lossless`, and `hires`. Map them to the service's
own tiers; they do not promise that the service offers that quality.
`renditionId` is a native song ID for this plugin. `trial` defaults to false and
`cacheable` to true. The initial stream URL needs a grant, but subsequent player
CDN redirects do not apply `networkDomains` at every hop. Host audio downloads use
that rule too. Do not describe the `http.request` redirect policy as universal.

`lyrics` returns an ordered `assets` array. Return `{assets: []}` for no lyrics:

```js
return {assets: [
  {format: "yrc", role: "original", text: "[0,1000](0,1000,0)Hello"},
  {format: "lrc", role: "translation", text: "[00:00.00]你好"},
  {format: "lrc", role: "romanization", text: "[00:00.00]Hello"}
]};
```

| Field | Values accepted at the plugin boundary |
|---|---|
| `format` | required; `lrc`, `yrc`, or `ttml`, converted to lowercase |
| `role` | `original`, `translation`, or `romanization`; omitted/empty means `original`; case-sensitive |
| `text` | required nonempty string, at most 4 × 1024 × 1024 UTF-16 code units |

The cap is 12 assets. With one asset per role, playback selects the original,
translation, and romanization in array order. Put the intended original first:
before a base is selected, a repeated translation or romanization can become the
base. Do not use duplicate roles as format alternatives. The host does not rank
formats or try another asset when the selected base parses to no lines. Sidecar
lines attach to the nearest original start time. The TTML parser handles embedded
translations/romanization; separate sidecars write those fields on matched lines.

Downloaded lyric text uses the first nonempty original, or the first other nonempty
asset if no original exists. It preserves raw text, without merging translations
or converting YRC/TTML to LRC. This differs from playback parsing.
Local-file/internal parsers also support QRC, LYS, ESLRC, and word-time LRC, but
the plugin boundary does not accept those `format` values or `translated`/`romaji`
role aliases. Convert them to an accepted format before returning them.

### Account and library

| handler | arguments | result |
|---|---|---|
| `account` | `{}` | `Account` |
| `login` | `{operation, ...}` | see section 6 |
| `like` | `{operation: "list"}` | native song ids, ≤100000 |
| `like` | `{operation: "set", id, liked}` | `true` or `{success: true}` |
| `playlistMutation` | `{operation, playlistId, songIds, name}` | same |
| `playlistReorder` | `{playlistId, songIds}`, complete new order, 1–10000 distinct native song IDs from this provider | `true` or `{success: true}` |
| `playlistCover` | `{playlistId, imageBase64, filename, mimeType}`, original image ≤8 MiB, filename is not a path | `true` or `{success: true}` |
| `share` | `{id, kind}` | a share URL string |

`playlistMutation` operations: `add`, `remove`, `subscribe`, `unsubscribe`,
`delete`, `create`. `create` carries no `playlistId`; it receives
`{operation:"create", name, private}` and returns `{id: "<native id>"}` or the id
string. Other operations carry ≤1000 `songIds`.

`matchSong` remains in the enum, but has no current host route, argument contract,
or result contract. Do not treat it as a callable matching interface.
`listenTogether` is also retained for compatibility, without a host handler route.
Plugins own such features through declarative UI, `backgroundTick`, and generic
playback calls. Declaring either name still requires a same-named handler at
startup, so new plugins should not declare them just as feature labels.

---

## 5. Data shapes

The host applies field-specific parsing rules. Most bounded arrays fail when
oversized; a few paths, such as `hotSearch`, truncate. Do not assume uniform strict
rejection for all fields. Missing optional fields take their defaults.

### Song

| Field | Type | Notes |
|---|---|---|
| `id` | string/number | **required**, native id |
| `title` | string | **required**, ≤4096 |
| `durationMs` | number | 0 – 31 days |
| `artworkUrl` | string | full-size cover; cleared if outside the grant |
| `artworkThumbUrl` | string | list-row sized cover, see below |
| `artists` | array | ≤64 `{id, name}`; entries without a `name` are dropped |
| `album` | object | `{id, name}`; left unset when `name` is empty |
| `isrc` | string | optional |
| `playable` | boolean | default `true` |
| `trial` | boolean | preview only |
| `restricted` | boolean | region or licensing restricted |

`artworkThumbUrl` is used by list rows. A song row is about 48dp tall while source
covers are typically around a thousand pixels square; without this field, scrolling
a long playlist downloads and fully decodes one full-size image per row, causing
dropped frames and frequent GC. If the CDN supports a resize parameter (NetEase's
`?param=140y140`, QQ's `T002R300x300`), provide it; otherwise the host falls back to
`artworkUrl`. The same domain check applies. Requires host 1.5.1 or later.

### Playlist

| Field | Type | Notes |
|---|---|---|
| `id` | string/number | **required** |
| `name` | string | **required**, ≤4096 |
| `description` | string | ≤1048576 UTF-16 code units |
| `artworkUrl` / `artworkThumbUrl` | string | as above |
| `trackCount` | number | track count |
| `playCount` | number | play count; displayed instead when there is no track count |
| `subscribed` / `owned` | boolean | followed / created by the user |
| `mutable` / `deletable` | boolean | follow `owned` unless set explicitly |
| `owner` | object | `{id, name}` |
| `songs` | array | ≤20000 |

### Album / Artist

Album: `id`, `name` (required), `artworkUrl`, `publishTimeMs`, `description`,
`trackCount` (≤1,000,000), `artists` (≤64), `songs` (≤5000).

Artist: `id`, `name` (required), `artworkUrl`, `description`, `albumCount`,
`songCount`, `songs` (≤1000), `albums` (≤1000).

### Account

`loggedIn`, `id`, `displayName`, `avatarUrl`, `membershipTier` (0–1000), `level`
(0–100000), `signature`. The avatar URL must also be inside the granted domains.

---

## 6. Login

The login UI belongs to the host; the flow is defined by the plugin. One `login`
handler serves five operations:

| operation | arguments | result |
|---|---|---|
| `methods` | `{operation:"methods", platform}`, currently `android` or `desktop` | array of methods, ≤8 |
| `begin` | `{methodId}` | challenge |
| `poll` | `{challengeId}` | challenge |
| `submit` | `{methodId, credential}` | challenge |
| `logout` | `{}` | `true` |

A login method:

```js
{
  id: "qr",                    // [a-z][a-z0-9._-]{0,63}
  type: "qr",                  // qr | web | credential | app
  label: "Scan to sign in",
  instructions: "Scan the code with the mobile app",
  // required for web, must be HTTPS and inside the grant:
  webUrl: "https://example.com/login",
  cookieUrl: "https://example.com",
  credentialCookieName: "SESSION",
  // optional for credential:
  credentialLabel: "Paste cookie",
  // optional app button label:
  appLabel: "Open app to confirm"
}
```

Use `platform` to select suitable methods; older callers may omit it. `app`
requires an app-link launcher, which is not guaranteed on desktop. Its `begin`
challenge returns `appUrl`; the host opens it only after a user click. This
controlled login link does not require `openUrl`.

`web` requires `webAuth`. `webUrl` and `cookieUrl` must be granted HTTPS URLs.
`credentialCookieName` must match `[A-Za-z0-9_.-]{1,64}`. The host checks for that
cookie, then sends the Cookie header for `cookieUrl` to `login` with `submit`;
it does not return only that one cookie. The plugin validates and persists the
credential. QPlayer does not interpret vendor cookie semantics.

A challenge is one snapshot of the flow:

```js
{
  id: "challenge-1",
  methodId: "qr",
  status: "waiting",           // waiting | scanned | success | expired | failed
  message: "Waiting for scan",
  qrContent: "https://...",    // the host renders the QR code
  expiresAtMs: 0,
  account: {loggedIn: true, id: "user-1", displayName: "Example"}
}
```

A challenge may also return `qrImageBase64`: raw PNG Base64, without a data URI
prefix, at most 300000 characters. The host checks Base64 and the PNG signature.
An image takes precedence over host-generated QR from `qrContent`.
`qrContent` and `message` allow 64 Ki characters; `appLabel` allows 4096.
HTTPS `appUrl` values need a network grant. Custom schemes are limited to
`snssdk1128`, `snssdk2329`, `snssdk8478`, `snssdk8663`, `luna`, `aweme`,
`orpheus`, `orpheuswidget`, `wtloginmqq`, `mqqapi`, `mqq`, and `qqmusic`.
Other/disallowed links are cleared and never opened automatically. `http`,
`intent`, and `file` are not accepted app schemes.

The plugin persists credentials with `credentials.put` and should delete those keys
on `logout`. Credentials are AES-GCM encrypted and namespaced per plugin; QPlayer
does not parse their contents.

---

## 7. `qplayer.call`

All calls are asynchronous and return a Promise.

| Method | Permission | Notes |
|---|---|---|
| `storage.get/put/delete` | — | `{key}` / `{key,value}`; key `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`; one serialized JSON record including key/value ≤1 MiB, not a total plugin quota |
| `credentials.get/put/delete` | `credentials` | encrypted, isolated per plugin and key |
| `http.request` | `network` | see below |
| `crypto.digest/random/aes/hmac/modPow/x25519` | — | see below |
| `compression.gunzip` | — | `{data, dataEncoding, outputEncoding}` |
| `playback.read` | `playbackRead` | playback snapshot |
| `playback.play/pause/seek/select/next/blockAutoAdvance` | `playbackControl` | source-neutral playback control |
| `queue.replace` | `queueWrite` | `{songs, currentSongId, positionMs, playing}` |
| `notifications.toast` | `notifications` | `{message}`, ≤500 chars |
| `clipboard.write` | `clipboard` | `{text}`, ≤16384 UTF-16 code units |
| `webAuth.runScript` | `webAuth` | `{originUrl, script}`; the script returns through `qplayerWebAuthDone(string)` |
| `files.save` | `files.save`, plus network grants for the URL | `{url, filename, mimeType, headers}`; download after the user selects a file |
| `files.downloadCurrent` | `files.save` | `{}`; open the host quality/download flow for the current song |

### webAuth.runScript

`originUrl` (≤2048 characters) must be a granted HTTP(S) URL; HTTP also needs
`clearTextNetwork`. The script allows 256 Ki characters and returns at most 64 Ki
characters through `qplayerWebAuthDone(string)`. Sessions close after completion
or a 45-second timeout. Each platform allows only one active script session.
Android runs in empty HTML with `originUrl` as the base URL. Desktop navigates to
the URL before injection, so the initial document is not identical across platforms.
The plugin owns SDK loading, initialization, and result parsing. Missing WebView,
desktop headless mode, or an unavailable Android Activity causes failure.
WebView requests and subresources do not pass through the `http.request` DNS and
redirect policy. Grant `webAuth` only to trusted plugins that need a browser.
Web login and script execution have different URL requirements.

### http.request

```js
qplayer.call("http.request", {
  url: "https://api.example.com/x",
  method: "POST",
  headers: {"Content-Type": "application/x-www-form-urlencoded"},
  body: "a=1&b=2",
  timeoutMs: 10000,        // 1000–30000
  includeBase64: false,    // true when binary bytes are needed
  followRedirects: true    // false returns the redirect response itself
})
// → {status, finalUrl, body, headers, setCookies, bodyBase64?}
```

The URL must match `networkDomains` and the method must be declared. Restricted
DNS destinations are rejected; private/loopback access requires `localNetwork`.
The default follows at most 5 redirects and checks each hop again. A 303, or
a 301/302 on POST, switches to GET, which must also be declared.
Use `followRedirects: false` to read the redirect status and Location.
`setCookies` collects every visited response's Set-Cookie values, including
redirects. The host does not maintain a cookie session for the plugin.
DNS checks and transport connection use separate lookups; no request-specific
DNS pinning is configured. This is not complete DNS-rebinding protection,
especially when `clearTextNetwork` is also granted.

`body` sends UTF-8 text; `bodyBase64` sends decoded binary bytes unchanged.
They are mutually exclusive. Alternatively, use
`multipart: {fields: {key: "value"}, file: {field: "file", filename: "cover.png",
mimeType: "image/png", bodyBase64: "..."}}`, exclusive with both body fields.
This is a field description, not a sendable image example. It permits 32 fields
of 4096 characters each and one nonempty file. The host generates the boundary
and adds Content-Type unless explicitly supplied. The encoded request body and
the response body each allow 16 MiB.

Without an explicit Accept-Encoding, the host negotiates gzip and decompresses
within both compressed and expanded 16 MiB limits. `body` is UTF-8 text and
`bodyBase64` contains the same decompressed bytes. Automatic decompression removes
Content-Encoding/Content-Length from returned headers. An explicit Accept-Encoding
keeps raw bytes; use `compression.gunzip` when needed. Duplicate response headers
are combined. A historical compatibility path turns a specific successful
ptlogin `ptqrlogin` redirect into `ptuiCB(...)` text; this is not a general redirect contract.

### Downloads

`files.save` downloads a granted URL to a user-selected file. It does not accept
an arbitrary local path. The host sanitizes `filename` (input ≤180 characters);
`mimeType` allows 128 characters and at most the first 64 headers are processed.
Every redirect checks the grant, with at most 5 redirects, a 1 GiB size cap,
and 120-second connect/read timeouts.
`files.downloadCurrent` takes no URL or song ID. It uses the current song at call
time, which may belong to another provider, and fails if there is no current song.
It opens the host quality/save flow and returns whether saving succeeded.
Cancellation returns false; errors may reject the Promise. These services require
a platform save picker. The handler's 90-second deadline still applies; the lower
network timeout does not extend how long the handler can wait.

### crypto

The host exposes a fixed set of primitives covering the signing and decryption
common sources require, rather than arbitrary algorithms:

- `crypto.digest` — `{algorithm: "SHA-256"|"SHA-1"|"MD5", data, dataEncoding, outputEncoding}`
- `crypto.random` — `{length: 1..1024, outputEncoding}`, length defaults to 16
- `crypto.aes` — `{transformation: "AES/CBC/PKCS5Padding"|"AES/ECB/PKCS5Padding"|"AES/GCM/NoPadding", operation: "encrypt"|"decrypt", key, iv, aad, data, outputEncoding}`
- `crypto.hmac` — `{algorithm: "HmacSHA256"|"HmacSHA1", key, data, outputEncoding}`
- `crypto.modPow` — `{baseHex, exponentHex, modulusHex, width}`, returns hex; width is the minimum hex digit count, not bytes
- `crypto.x25519` — `{scalar, point, outputEncoding}`, 32 bytes each; omitted point defaults to base point 9
- `crypto.sha256` — historical shortcut, `{value}`; UTF-8 SHA-256 returned as hex

`data` defaults to `utf8`; `key`, `iv`, `aad`, `scalar`, and `point` default to
`base64`. Select `utf8`/`base64`/`hex` with `<name>Encoding`. The output field
is `outputEncoding`, not `output`, and defaults to `base64`. This also applies to
`compression.gunzip`. AES keys require 16/24/32 bytes; CBC IV requires 16 bytes
and GCM IV 12 bytes. ECB does not use an IV.

### Playback state

`playback.read` returns:

```js
{
  currentSongId: "123",     // empty when the current track is not the plugin's
  queueSongIds: ["1","2"],  // empty array when the queue mixes other sources
  positionMs: 0, durationMs: 0,
  playing: true,
  transitioning: false,     // the host is switching tracks
  seekRevision: 0,          // host seek marker, not only user drags
  endRevision: 0            // natural-end marker, even while auto-advance is blocked
}
```

These revisions are host-wide event counters, not queue versions or song IDs.
They do not identify the last ended song. Position, playback state, and revisions
are global even when the current song belongs to another plugin. Only identity
fields are filtered; do not infer other providers' IDs from them.

| Call | Arguments and behavior |
|---|---|
| `playback.play/pause/next` | `{}`; global player controls; `next` uses host auto-advance logic |
| `playback.seek` | `{positionMs}`, clamped to 0–31 days |
| `playback.select` | `{songId, positionMs, playing}`; target must already be in the queue; playing defaults to true |
| `playback.blockAutoAdvance` | `{blocked}`; block natural-end auto-advance; releasing this plugin's block can execute a pending advance |
| `queue.replace` | `{songs, currentSongId, positionMs, playing}`; ≤500 Song DTOs, all owned by this plugin; target must exist in the replacement |

`songId`/`currentSongId` may be native IDs or canonical song IDs for this plugin,
never cross-provider targets. Replacement clears the old queue and playlist
context; `playing` defaults to true. `playbackControl` controls the global player,
not only this source, while selection/replacement enforce the ownership rules above.

---

## 8. Declarative dialogs

A plugin contributes no QML. It declares an entry in the manifest and returns a
structured description, which QPlayer renders with its own Material 3 components.
A plugin dialog therefore follows the app's theme, dark mode and text scale without
any styling code, at the cost of being limited to the nodes listed below.

```json
{"id": "preferences", "placement": "settings", "label": "Preferences", "icon": "tune"}
```

A nonempty `ui` manifest requires `customUi` and a `handlers["ui.<id>"]` function
for every entry. Entry labels allow 40 characters; icons match `[a-z][a-z0-9_]{0,63}`.

`placement: "settings"` appears on that plugin's settings page;
`placement: "playerAction"` appears in the phone top bar and the tablet/desktop
navigation rail. QPlayer does not know what the entry does; it only places it.

Opening the entry invokes `handlers["ui.<entry id>"]` with
`{action, payload: {inputs}}`:

- `action` is `open` when the dialog opens
- `refreshMs` in the description (0, or 500–60000) makes the host re-invoke it with
  `refresh`
- pressing a button or flipping a switch sends that control's own `id`
- `inputs` maps every input and switch id to its current value (string / boolean)

Each reply replaces the previous description. The plugin owns the state; the host
owns the rendering.

```js
return {
  title: "Listen Together", subtitle: "NetEase Cloud Music", icon: "group", refreshMs: 1500,
  body: [
    {type: "text", style: "title", center: true, text: "2 listeners"},
    {type: "switch", id: "unlock", label: "Source unlock", desc: "Try other sources for greyed tracks", checked: true},
    {type: "input", id: "invitation", placeholder: "Invite link or room id"},
    {type: "row", items: [
      {type: "button", id: "create", label: "Create", style: "filled"},
      {type: "button", id: "join", label: "Join", style: "outlined"}
    ]}
  ]
};
```

| Node | Fields |
|---|---|
| `text` | `text` (≤500), `style` (`title`/`body`/`caption`), `center` |
| `error` | `text` (≤300) |
| `input` | `id`, `placeholder` (≤60), `value` (≤2048), `secret` |
| `switch` | `id`, `label` (≤120), `desc` (≤500), `checked`, `enabled` |
| `button` | `id`, `label` (≤24), `style` (`filled`/`outlined`/`text`), `enabled`, `destructive` |
| `row` | `items`: 1–3 buttons, no nesting |
| `spacer` | `height` 0–48 |

`title` ≤60, `subtitle` ≤120, at most 10 body nodes. Ids match
`[a-z][a-z0-9._-]{0,63}`; inputs and switches share one id space and must be unique.

A `switch` is both input and action: flipping it submits its own id, and its new
state arrives as a boolean in `payload.inputs[id]`. Use it for on/off state; the
host renders it identically to its own settings rows.

The schema has no colors, images, rich text, or free-form geometry. The host
rebuilds descriptions from an allowlist and drops unknown extra fields. Unknown
node types, invalid field types, and out-of-range values fail the description.
Do not rely on extra fields to change rendering.

### Background tick

Declare `backgroundTimers` and define `backgroundTick` in `module.exports.handlers`,
not in `capabilities`. The host schedules it about once a second with an empty
argument object and ignores its return value. If the previous tick is unfinished,
the next tick is skipped; timing is not exact. Closing UI does not stop ticks.
Disable, removal, and host shutdown stop future scheduling; this does not promise
an always-running system service. The plugin owns room protocols, synchronization,
and polling. `backgroundTimers` is not a general JavaScript timer API.

---

## 9. Packaging, signing, releasing

```text
plugin.json
src/main.js
META-INF/qplayer-files.json     # SHA-256 of every file
META-INF/qplayer.sig            # P-256 ECDSA/SHA-256 over that file's exact bytes (Base64 DER)
```

Every file except the hash manifest itself and the signature must appear in that
hash list. Installed files are re-hashed before every activation, so files added or
modified afterwards are not executed.

Manual import accepts unsigned packages, not only for development. It requires a
code-execution warning even if a package contains a signature; that alone does not
establish publisher trust. Catalog installation/updates require the pinned key:

```bash
QPLAYER_PLUGIN_SIGNING_KEY=/secure/path/publisher-private.pem ./scripts/package.sh
```

The bundled catalog is
`player-core/src/main/resources/dev/t1m3/qplayer/plugin/plugin-catalog.json`.
Entries include plugin ID, GitHub `repo`, and `publisherKey`. The host reads
`releases/latest` and selects the first `.qplug` asset; attach only one to avoid
ambiguity. The template workflow requires `v<plugin.json.version>` as the tag,
but installation uses the signed manifest's ID and version. Catalog changes need
a host release. Plugin versions can ship independently if ID, key, and compatibility stay valid.

Released binaries retain their pinned key. Packages signed by a replacement key
fail catalog installation/updates on those hosts. Editing a repository key file
cannot update released hosts; coordinate key changes with catalog and host updates.
A signature in a package does not imply current-host trust. For package file
selection and the template workflow, see the [README](../README.en.md#signing-and-releasing).

---

## 10. Limits at a glance

| Item | Limit |
|---|---|
| One handler call | 90 s |
| One JS module | 4 MiB |
| Returned value | depth 32 / 500k nodes / 24 Mi UTF-16 code units across strings |
| `http.request` body, response | 16 MiB each |
| HTTP timeout | 1–30 s, default 10 |
| Redirects | 5 |
| `storage` record | 1 MiB including serialized key/value JSON |
| Native id | 2048 bytes |
| Title/name text | 4096 chars |
| Description text | 1048576 UTF-16 code units |
| Pagination cursor | 8192 chars |
| Search results | 200 per page |
| Playlist tracks | 20000 |
| Lyrics | 12 assets, 4 Mi UTF-16 code units each |
| Dialog | 10 nodes |
| UI entries | 8 |

---

## 11. Common issues

- URLs returned by a plugin are subject to the same network grant. Covers, stream
  URLs, login pages and avatars must all be inside `networkDomains`, or the cover is
  cleared and the stream fails. Update the manifest when a CDN changes.
- One-shot stream URLs should set `cacheable: false`, otherwise the host caches a URL
  that has already expired.
- `nextCursor` should not carry a placeholder such as `"null"`; any non-empty string
  means there is another page.
- Artist or album entries without a name are dropped rather than failing the
  response. Real catalogs contain them (cloud uploads, delisted artists), and
  dropping a single entry keeps the rest of the playlist usable.
- `limit` handling differs by interface. Obey the requested size and each
  structure's hard cap. Most bounded arrays fail when oversized; do not rely on truncation.
- Avoid CPU-bound loops in a handler. The 90-second timeout covers the whole call,
  including time spent waiting on the network.

For debugging, call `notifications.toast` with non-secret information (requires
`notifications`). `storage.put` has no developer inspection UI and is not a log
interface. Do not store cookies or tokens there. Time, network, and returned-value
limits still apply to debugging code.
