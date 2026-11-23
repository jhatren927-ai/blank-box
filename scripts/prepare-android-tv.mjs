import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const android = path.join(root, 'android')
const manifestPath = path.join(android, 'app/src/main/AndroidManifest.xml')
if (!fs.existsSync(manifestPath)) throw new Error('Capacitor Android manifest was not generated.')

let manifest = fs.readFileSync(manifestPath, 'utf8')

if (!manifest.includes('android.software.leanback')) {
  manifest = manifest.replace(
    /(<manifest\b[^>]*>)/,
    '$1\n    <uses-feature android:name="android.software.leanback" android:required="false" />\n    <uses-feature android:name="android.hardware.touchscreen" android:required="false" />',
  )
}

if (!/android:banner=/.test(manifest)) {
  manifest = manifest.replace('<application', '<application android:banner="@drawable/tv_banner"')
}

const activityMatch = [...manifest.matchAll(/<activity\b[^>]*>/g)]
  .find((match) => /android:name="[^"]*MainActivity"/.test(match[0]))
if (!activityMatch) throw new Error('Could not find Capacitor MainActivity in AndroidManifest.xml.')

let activityTag = activityMatch[0]
if (!/android:screenOrientation=/.test(activityTag)) {
  const updated = activityTag.replace(/>$/, ' android:screenOrientation="landscape">')
  manifest = manifest.replace(activityTag, updated)
  activityTag = updated
}

const activityStart = manifest.indexOf(activityTag)
const activityClose = manifest.indexOf('</activity>', activityStart)
if (activityStart < 0 || activityClose < 0) throw new Error('Could not locate MainActivity closing tag.')
const activityBody = manifest.slice(activityStart, activityClose)
if (!activityBody.includes('android.intent.category.LEANBACK_LAUNCHER')) {
  manifest = manifest.slice(0, activityClose)
    + '        <intent-filter>\n'
    + '            <action android:name="android.intent.action.MAIN" />\n'
    + '            <category android:name="android.intent.category.LEANBACK_LAUNCHER" />\n'
    + '        </intent-filter>\n'
    + manifest.slice(activityClose)
}

fs.writeFileSync(manifestPath, manifest)

const bannerDir = path.join(android, 'app/src/main/res/drawable')
fs.mkdirSync(bannerDir, { recursive: true })
fs.writeFileSync(path.join(bannerDir, 'tv_banner.xml'), [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">',
  '    <gradient android:angle="0" android:startColor="#283d70" android:centerColor="#0d2460" android:endColor="#070d1b" />',
  '    <corners android:radius="5dp" />',
  '    <stroke android:width="2dp" android:color="#e8c65b" />',
  '</shape>',
  '',
].join('\n'))

const javaRoot = path.join(android, 'app/src/main/java')
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}
const mainActivity = walk(javaRoot).find((file) => /MainActivity\.(java|kt)$/.test(file))
if (!mainActivity) throw new Error('Could not find generated MainActivity source.')

let source = fs.readFileSync(mainActivity, 'utf8')
if (mainActivity.endsWith('.java')) {
  for (const item of ['import android.os.Bundle;', 'import android.view.View;', 'import android.view.WindowManager;']) {
    if (!source.includes(item)) source = source.replace(/(package [^;]+;)/, '$1\n\n' + item)
  }
  if (!source.includes('FLAG_IMMERSIVE_STICKY')) {
    const javaClass = [
      'public class MainActivity extends BridgeActivity {',
      '    @Override',
      '    public void onCreate(Bundle savedInstanceState) {',
      '        super.onCreate(savedInstanceState);',
      '        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);',
      '        hideTvSystemBars();',
      '    }',
      '',
      '    @Override',
      '    public void onWindowFocusChanged(boolean hasFocus) {',
      '        super.onWindowFocusChanged(hasFocus);',
      '        if (hasFocus) hideTvSystemBars();',
      '    }',
      '',
      '    private void hideTvSystemBars() {',
      '        getWindow().getDecorView().setSystemUiVisibility(',
      '            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY',
      '            | View.SYSTEM_UI_FLAG_FULLSCREEN',
      '            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION',
      '            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE',
      '            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION',
      '            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN',
      '        );',
      '    }',
      '',
      '    @Override',
      '    public void onBackPressed() {',
      '        if (bridge == null || bridge.getWebView() == null) {',
      '            super.onBackPressed();',
      '            return;',
      '        }',
      '        bridge.getWebView().evaluateJavascript(',
      '            "(function(){var e=new KeyboardEvent(\'keydown\',{key:\'Escape\',cancelable:true,bubbles:true});window.dispatchEvent(e);return String(e.defaultPrevented);})()",',
      '            handled -> { if (!"true".equals(handled)) MainActivity.super.onBackPressed(); }',
      '        );',
      '    }',
      '}',
    ].join('\n')
    source = source.replace(/public class MainActivity extends BridgeActivity\s*\{\s*\}/, javaClass)
  }
} else if (!source.includes('IMMERSIVE_STICKY')) {
  source = source.replace(/(package [^\n]+\n)/, '$1\nimport android.os.Bundle\nimport android.view.View\nimport android.view.WindowManager\n')
  const kotlinClass = [
    'class MainActivity : BridgeActivity() {',
    '    override fun onCreate(savedInstanceState: Bundle?) {',
    '        super.onCreate(savedInstanceState)',
    '        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)',
    '        @Suppress("DEPRECATION")',
    '        window.decorView.systemUiVisibility = (',
    '            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY',
    '            or View.SYSTEM_UI_FLAG_FULLSCREEN',
    '            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION',
    '            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE',
    '            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION',
    '            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN',
    '        )',
    '    }',
    '}',
  ].join('\n')
  source = source.replace(/class MainActivity : BridgeActivity\(\)\s*\{?\}?/, kotlinClass)
}
fs.writeFileSync(mainActivity, source)

const gradlePath = path.join(android, 'app/build.gradle')
if (fs.existsSync(gradlePath)) {
  const code = Number(process.env.GITHUB_RUN_NUMBER || 1) + 1000
  let gradle = fs.readFileSync(gradlePath, 'utf8')
  gradle = gradle.replace(/versionCode\s*(?:=\s*)?1\b/, 'versionCode ' + code)
  gradle = gradle.replace(/versionName\s*(?:=\s*)?"[^"]*"/, 'versionName "1.0.' + code + '"')
  fs.writeFileSync(gradlePath, gradle)
}

console.log('Prepared Blank Box TV manifest, launcher, banner, immersive mode, and version code.')
