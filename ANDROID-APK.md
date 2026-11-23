# Blank Box TV Android APK

The Android/Fire TV package is built in GitHub Actions from the same React application. Capacitor packages the built web assets inside the APK; the app does not load the GitHub Pages website as its user interface.

- App ID: `tv.blankbox.app`
- TV launcher: Android `LEANBACK_LAUNCHER`
- Orientation: landscape
- Display: immersive/fullscreen
- Remote: D-pad and numeric channel tuning
- Account/network data: existing Cloudflare Worker and D1 services

The workflow publishes the installable APK at:

`https://github.com/jhatren927-ai/blank-box/releases/download/tv-latest/blank-box-tv.apk`

The app still uses Android WebView to render the bundled React interface and existing provider playback components. Native playback engines are not part of this first APK build.

The first sideload build uses a stable cached debug signing key so repeat builds can normally install as updates. GitHub Actions cache is best-effort; for permanent production updates, replace this with a private upload keystore stored only as GitHub Actions secrets.
