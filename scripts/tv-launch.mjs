export function enableTvLaunch(html) {
  const marker = '<!-- blank-box-tv-launch -->'
  if (html.includes(marker)) return html
  if (!html.includes('<head>')) throw new Error('Could not find the document head for TV launch setup.')
  return html.replace(
    '<head>',
    '<head>\n    ' + marker + '\n    <script>document.documentElement.dataset.tvApp = "true";</script>',
  )
}
