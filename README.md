# Blank Box

Blank Box is a blank cable network you fill yourself. It opens with a made-up network name and empty channel slots. Type a theme, pick videos, and the channel plays 24/7 on a schedule computed in the browser from the clock. The guide, the cable box, and the picture use the same 90s Prevue look as a retro cable channel: blue grid, yellow type, CRT glass, channel up and down, now and next, and On Demand.

Blank Box works offline-first: the current lineup lives in `localStorage`. Optional Cloud Save uses a small Cloudflare Worker and D1 database so a lineup can be saved once and reopened on another device with a private link. No visitor account, email address, or sign-in is required.

## Run it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5199.\n\nFor a television browser or the Downloader app on Fire TV / Android TV, open the deployed site with `?tv=1` appended. Example: `https://jhatren927-ai.github.io/blank-box/?tv=1`. The TV mode adds high-contrast focus styling and directional remote navigation. It remains a website; no APK or video-downloader feature is required.

```bash
npm run build
npm run preview
```

`npm run build` writes a static site to `dist/`. Asset paths are relative (`base: './'`), so the same folder works on GitHub Pages and Vercel.

Check the real flow in a browser:

```bash
npx playwright install chromium
npm run verify
```

## Make a channel

1. Tap an empty channel.
2. Type what it should play, like `cartoons` or `space`, then tap **Make it**.
3. Tap **Add** on the videos you want. About 60 fills a day. One is enough to start.
4. Tap **Watch**.

That is the whole path. Channel up and down, the guide, and On Demand are on the TV screen. Tap the network name at the top to rename it.

## Deploy

The build does not need a backend.

**Vercel:** import the repo, framework Vite, output `dist`. Leave the install and build commands as `npm install` and `npm run build`.

**GitHub Pages:** the included Actions workflow builds `dist/` and deploys it. Relative asset URLs mean a project site (`https://user.github.io/repo/`) works without a special base path. In repository Settings → Pages, select **GitHub Actions** as the build and deployment source.

## Where videos come from

Every source implements `SourceAdapter` in `src/sources/types.ts` and is registered in `src/sources/index.ts`.

| Source | How you add it | Playback |
| --- | --- | --- |
| Archive.org | Search. Defaults to public-domain and Creative Commons collections. A switch searches all of Archive.org. Grown-up titles are filtered. | The h.264 MP4 from the metadata API, in a `<video>` tag |
| YouTube | Paste a video or playlist link. There is no keyless search. | Official IFrame Player API. Ads stay on |
| A link | Paste an mp4, webm, HLS `.m3u8`, or DASH `.mpd` | `<video>`, hls.js, or dash.js |
| A playlist | Paste an M3U/M3U8 list | Each entry becomes a show |
| Vimeo | Paste a public link | player.js embed |
| Dailymotion | Search or paste a link | Official embed, family filter on by default |
| Wikimedia Commons | Search | The Commons file URL |
| NASA | Search the public image and video library | The smaller MP4 from `collection.json` |

A new source is one object with `search`, `fromHit`, and `fromPaste`. Leave `search` null when a link is the only honest way in. Do not add sites that need scraped pages, a secret key, or a broken terms of service.

The player never talks to those sites except to resolve a program and then play it. The schedule does not ask a server what is on.

## Schedule

`src/lib/schedule.ts` walks each channel’s durations from a phase derived from the channel id and the wall clock. Two devices with the same lineup are on the same moment of the same show. Unknown lengths are stored as a guess (10 minutes, or 30 for a live-style HLS link) and can be nudged with the − and + buttons before you watch.

## Cloud save, sync code, lock, accounts

Settings includes **Save lineup online**. The first save creates a private restore link backed by Cloudflare D1; later saves update that same cloud copy. Open the link on another device to restore the lineup. The link contains a long random secret, so anyone who has it can view and overwrite that saved lineup. Keep it private. The cloud API is hosted by the `blank-box-save` Cloudflare Worker at `https://blank-box-save.blankbox-tv.workers.dev`; the public GitHub Pages site calls it directly. A separate save is created for each browser until the user transfers or opens the private link.

The cloud service stores lineup JSON only. It does not proxy, download, or host video content.

### Manual sync code

Settings also builds a `BB1.` code: the lineup JSON, gzipped, then base64url. Paste it on another device, or scan the QR when the code is short enough to fit. A long lineup still copies as text.

The optional 4-digit lock is a tap guard stored as a salted SHA-256 hash on the lineup. Hold the lock screen for 3 seconds to erase the lock without deleting channels. It is not account security.

`src/auth/accounts.ts` is a placeholder for optional passwordless accounts later. Accounts are not required for Cloud Save.

## What the browser check covered

`npm run verify` drives Chromium through the real app:

- A network name is generated on first open.
- An Archive.org channel is made by searching and hand-picking three movies. Playback starts in the CRT player, and the titles show up in the Prevue guide.
- A YouTube channel is made by pasting a video URL. The official IFrame Player API embed is created (`youtube.com/embed/…?enablejsapi=1`). In this datacenter YouTube answers with error 150 and a “Sign in to confirm you’re not a bot” wall, so the picture does not start here. On a normal browser the same embed plays, ads included. Playlist links use that same player to read the video ids. YouTube has no keyless search.
- An HLS link plays through hls.js. The check uses Mux’s public test stream, which sends the CORS headers hls.js needs. Apple’s sample stream did not.
- Channel down changes the on-screen channel.
- Export, erase, and paste of the sync code restores the three channels.

NASA, Wikimedia Commons, Vimeo, and Dailymotion were checked against their public APIs (search or oEmbed, CORS, and a playable file or player id). Pexels and Pixabay need API keys, so they are not included. DASH (`.mpd`) uses dash.js when the manifest allows browser fetches.


## Fire TV and Android TV browser mode

Blank Box is designed to run as a hosted website in a compatible browser, including the built-in browser in Downloader where supported. Enter the deployed HTTPS website URL, preferably with `?tv=1` appended. The TV mode provides directional focus navigation, visible focus rings, and channel-up/down behavior when focus is not on a control.

Browser playback still depends on the device's browser engine, supported codecs, stream CORS policy, and each provider's embed restrictions. The web app cannot override those restrictions or guarantee background / uninterrupted 24-hour playback. Test the actual target device and streams before relying on a channel lineup.
