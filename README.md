# 321bridge

**Third party to first party storage bridge for embedded widgets.**

Chat widgets, booking forms, comment boxes and other embeds usually run in an iframe served from the vendor's
site. To the browser, that iframe is *third party*, and browsers increasingly refuse it storage:

- Firefox with strict tracking protection, or with third-party cookies blocked, throws
  `SecurityError: The operation is insecure` the moment the frame touches `localStorage`.
- Chrome blocks third-party storage in Incognito, and whenever third-party cookies are blocked.
- Safari blocks or quickly evicts third-party storage.

When that happens the widget forgets everything on every page load: the visitor's identity, the conversation
in progress, their settings.

321bridge lets the frame keep its `localStorage` and `sessionStorage` in the **host page**, which is first
party and keeps its storage. The frame does not need to change how it uses storage. It keeps calling
`localStorage.getItem(...)` and `setItem(...)`; those calls are served from memory, and each write is
mirrored to the host page.

```
 host page (first party)                       iframe (third party)
 ┌───────────────────────────┐   1. seed      ┌───────────────────────────┐
 │ localStorage              │ ─────────────▶ │ localStorage (bridged)    │
 │   __chat.example__store   │   in the URL   │   store                   │
 │                           │                │                           │
 │ bridgeFrame(iframe, url)  │ ◀───────────── │ 321bridge-frame.js        │
 └───────────────────────────┘   2. writes    └───────────────────────────┘
                                 postMessage
```

1. **Seed.** The host page reads the frame's saved items from its own storage and passes them in the frame
   URL's hash, so they are available synchronously before the frame's first script runs.
2. **Writes.** Every write in the frame is posted to the host page, which saves it under a prefix for that
   frame.
3. **Reload.** The frame keeps its own URL hash current, so if the frame reloads itself it starts from its
   latest state.

## Is this not what the Storage Access API is for?

The [Storage Access API](https://developer.mozilla.org/docs/Web/API/Storage_Access_API) gives a frame its
unpartitioned storage, but only after a user gesture inside the frame, often a browser prompt, and only if the
user has previously visited the frame's site as a top-level page. Visitors to a site with an embedded widget
have usually never visited the widget vendor's site, so browsers deny the request.

Storage partitioning, the default in current browsers, does not need a bridge: the frame gets storage of its
own per host site. 321bridge is for the stricter modes where third-party storage is blocked outright, and it
behaves identically in every browser.

## Install

```sh
npm install @preeder/321bridge
```

Or copy the two drop-in scripts from `dist/`: `321bridge-frame.js` for the frame and `321bridge-host.js`
for the host page.

## Usage

### In the frame

Load the frame script **first**, with a plain synchronous `<script>` (no `async`, `defer` or `type="module"`),
before any script that uses storage:

```html
<head>
  <script src="/321bridge-frame.js"></script>
  <script defer src="/app.js"></script>
</head>
```

It does nothing unless the host page bridged the frame, so the same page works with and without the bridge.

If you would rather bundle it, call `installFrameStorage()` at the very top of your entry point, before any
import that might read storage:

```js
import { installFrameStorage } from '@preeder/321bridge';

installFrameStorage();
```

### In the host page

Create the iframe and let 321bridge load it:

```js
import { bridgeFrame } from '@preeder/321bridge';

const iframe = document.createElement('iframe');
document.body.appendChild(iframe);
const disconnect = bridgeFrame(iframe, 'https://chat.example/widget');
```

Without a bundler, use the host script, which exposes `Bridge321`:

```html
<script src="https://chat.example/321bridge-host.js"></script>
<script>
  Bridge321.bridgeFrame(iframe, 'https://chat.example/widget');
</script>
```

`bridgeFrame` sets `iframe.src` itself. Call it instead of setting `src`.

#### Options

| Option   | Default                | Meaning                                                              |
| -------- | ---------------------- | -------------------------------------------------------------------- |
| `prefix` | `__<frame host>__`     | Prefix for the frame's keys in the host page's storage.              |

With the default prefix, a frame from `chat.example` stores `store` as `__chat.example__store`.

## Security

- **The host page only accepts writes from the frame it bridged**, checked by both the message source window
  and the frame's origin. Other frames on the page, such as ads, cannot write to the bridged storage.
- **The frame only sends its writes to the host page's origin.** That origin comes from the seed. If the seed
  is unreadable, the frame falls back to `location.ancestorOrigins` and then `document.referrer`. If neither
  is available, the frame keeps its storage in memory and sends nothing.
- **The frame ignores a seed when it is not framed.** A link that opens the frame's URL directly with a seed
  in its hash cannot plant state in it.
- **The host page fully controls the frame's storage.** It can read everything the frame stores and hand it
  any values it likes. That is inherent to keeping storage in the host page. Do not store anything in a
  bridged frame that the embedding site must not see. Treat stored values as input from the embedder.
- **Seeds travel in the URL hash.** The browser does not send the hash to the server or include it in the
  `Referer` header, but scripts in the host page can read the iframe's `src`, and they can already read the
  host page's storage anyway.

## Limitations

- **Frames that use hash-based routing are not supported.** The bridge owns the frame URL's hash.
- **Only the `Storage` methods are bridged:** `getItem`, `setItem`, `removeItem`, `clear`, `key` and
  `length`. Property access such as `localStorage.foo = 'x'` is not.
- **No `storage` events.** Changes made in another tab are not delivered to a bridged frame while it is
  open; they are picked up the next time it loads.
- **Size.** The seed is limited by the maximum URL length: about 2 MB in Chromium and Firefox, more in
  Safari. That is plenty for typical widget state but not for caches of large data.
- **A frame reload within about 50 ms of a write** may start from the state before that write. The host page
  still has the write, and the next fresh load of the frame includes it.

## Demo

```sh
npm install
npm run demo
```

Open <http://localhost:8091> in a private window, or with third-party cookies blocked. The frame is served
from `http://127.0.0.1:8092`, which is a different site, so it is genuinely third party. Toggle
**Use 321bridge** to compare.

## Development

```sh
npm run typecheck
npm test
npm run build
```

## License

MIT
