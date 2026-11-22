import { useEffect, useRef, useState, type RefObject } from 'react'
import { Cast, ExternalLink, Play, RotateCcw } from 'lucide-react'
import type { Channel, Program } from '../types.ts'
import { lookById } from '../lib/looks.ts'
import { clock, mmss, padChannel } from '../lib/format.ts'
import { liveSlot, nextSlot, programDuration } from '../lib/schedule.ts'
import { loadYouTubeAPI } from '../sources/youtube.ts'

interface PlayTarget {
  key: string
  program: Program
  offsetSec: number
  live: boolean
}

function seekAndPlay(video: HTMLVideoElement, offset: number, rate: number, onPlayBlocked?: () => void) {
  const apply = () => {
    video.playbackRate = rate
    const duration = video.duration
    if (offset > 1 && Number.isFinite(duration) && offset < duration - 1) {
      try {
        video.currentTime = offset
      } catch {
        // Some live and segmented streams do not expose a seekable range yet.
      }
    }
    void video.play().catch(() => onPlayBlocked?.())
  }
  if (video.readyState >= 1) apply()
  else video.addEventListener('loadedmetadata', apply, { once: true })
}

function useVideoKnobs(
  ref: RefObject<HTMLVideoElement | null>,
  muted: boolean,
  volume: number,
  rate: number,
) {
  useEffect(() => {
    const video = ref.current
    if (!video) return
    video.muted = muted
    video.volume = volume
    video.playbackRate = rate
  }, [ref, muted, volume, rate])
}

function StaticSnow() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let frame = 0
    const image = ctx.createImageData(canvas.width, canvas.height)
    const draw = () => {
      for (let i = 0; i < image.data.length; i += 4) {
        const shade = Math.random() * 255
        image.data[i] = shade
        image.data[i + 1] = shade
        image.data[i + 2] = shade
        image.data[i + 3] = 255
      }
      ctx.putImageData(image, 0, 0)
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [])
  return <canvas ref={ref} width={160} height={90} className="h-full w-full [image-rendering:pixelated]" />
}

function FileVideo({
  program,
  offsetSec,
  muted,
  volume,
  rate,
  onStarted,
  onError,
  onBuffering,
  onEnded,
}: EngineProps) {
  const ref = useRef<HTMLVideoElement>(null)
  useVideoKnobs(ref, muted, volume, rate)
  return (
    <video
      ref={ref}
      data-testid="live-video"
      className="h-full w-full bg-black object-contain"
      src={program.playUrl}
      playsInline
      preload="auto"
      autoPlay
      muted={muted}
      onLoadedMetadata={(event) => seekAndPlay(event.currentTarget, offsetSec, rate)}
      onPlaying={onStarted}
      onWaiting={onBuffering}
      onError={() => onError('file')}
      onEnded={onEnded}
    />
  )
}

function HlsVideo(props: EngineProps) {
  const ref = useRef<HTMLVideoElement>(null)
  useVideoKnobs(ref, props.muted, props.volume, props.rate)
  useEffect(() => {
    const video = ref.current
    const url = props.program.playUrl
    if (!video || !url) return
    let dead = false
    let detach: (() => void) | null = null
    void import('hls.js').then(({ default: Hls }) => {
      if (dead) return
      if (Hls.isSupported()) {
        let networkRetries = 0
        let mediaRecoveries = 0
        const hls = new Hls({
          capLevelToPlayerSize: true,
          // Keep a useful forward buffer for variable home/TV Wi-Fi while
          // limiting memory use on low-RAM Fire TV and Android TV devices.
          lowLatencyMode: false,
          maxBufferLength: 90,
          maxMaxBufferLength: 180,
          maxBufferSize: 120 * 1000 * 1000,
          backBufferLength: 30,
          maxBufferHole: 0.8,
          startFragPrefetch: true,
          highBufferWatchdogPeriod: 3,
          nudgeOffset: 0.2,
          nudgeMaxRetry: 5,
          manifestLoadingMaxRetry: 4,
          levelLoadingMaxRetry: 4,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 1000,
          fragLoadingMaxRetryTimeout: 64000,
        })
        detach = () => hls.destroy()
        hls.loadSource(url)
        hls.attachMedia(video)
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          seekAndPlay(video, props.offsetSec, props.rate, () => props.onError('autoplay-blocked'))
        })
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 2) {
            networkRetries += 1
            hls.startLoad()
            return
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 1) {
            mediaRecoveries += 1
            hls.recoverMediaError()
            return
          }
          props.onError(`hls-${data.details}`)
        })
      } else if (video.canPlayType('application/vnd.apple.mpegurl') || video.canPlayType('application/x-mpegURL')) {
        video.src = url
        seekAndPlay(video, props.offsetSec, props.rate, () => props.onError('autoplay-blocked'))
      } else {
        props.onError('hls-unsupported')
      }
    }).catch(() => props.onError('hls-engine-unavailable'))
    return () => {
      dead = true
      detach?.()
    }
    // Remounted per program via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.program.playUrl])
  return (
    <video
      ref={ref}
      data-testid="live-video"
      className="h-full w-full bg-black object-contain"
      playsInline
      preload="auto"
      autoPlay
      muted={props.muted}
      onPlaying={props.onStarted}
      onWaiting={props.onBuffering}
      onError={() => props.onError('hls')}
      onEnded={props.onEnded}
    />
  )
}

function DashVideo(props: EngineProps) {
  const ref = useRef<HTMLVideoElement>(null)
  useVideoKnobs(ref, props.muted, props.volume, props.rate)
  useEffect(() => {
    const video = ref.current
    const url = props.program.playUrl
    if (!video || !url) return
    let dead = false
    let player: { destroy: () => void } | null = null
    const offset = props.offsetSec
    const fail = props.onError
    void import('dashjs').then((dash) => {
      if (dead) return
      const created = dash.MediaPlayer().create()
      player = created
      created.initialize(video, url, true, Math.max(0, offset))
      created.on('error', () => fail())
    }).catch(() => fail())
    return () => {
      dead = true
      player?.destroy()
    }
  }, [props.program.playUrl])
  return (
    <video
      ref={ref}
      data-testid="live-video"
      className="h-full w-full bg-black object-contain"
      playsInline
      autoPlay
      muted={props.muted}
      onPlaying={props.onStarted}
      onWaiting={props.onBuffering}
      onError={() => props.onError('dash')}
      onEnded={props.onEnded}
    />
  )
}

function YouTubeVideo(props: EngineProps) {
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<YTPlayer | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  useEffect(() => {
    let dead = false
    const videoId = props.program.youtubeId
    const playlistId = props.program.youtubePlaylistId
    const offset = props.offsetSec
    if (!videoId && !playlistId) return
    void loadYouTubeAPI()
      .then((YT) => {
        if (dead || !host.current) return
        player.current = new YT.Player(host.current, {
          ...(videoId ? { videoId } : {}),
          playerVars: {
            autoplay: 1,
            playsinline: 1,
            rel: 0,
            ...(playlistId ? { listType: 'playlist', list: playlistId } : {}),
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              const current = propsRef.current
              const real = event.target.getDuration() || 0
              const wanted = current.program.durationGuess || playlistId ? 0 : offset
              if (!playlistId && real > 1 && wanted > 1 && wanted < real - 1) event.target.seekTo(wanted, true)
              if (current.muted) event.target.mute()
              else {
                event.target.unMute()
                event.target.setVolume(Math.round(current.volume * 100))
              }
              try {
                event.target.setPlaybackRate(current.rate)
              } catch {
                /* the player picks the closest rate */
              }
              event.target.playVideo()
            },
            onStateChange: (event) => {
              if (event.data === YT.PlayerState.PLAYING) propsRef.current.onStarted()
              if (event.data === YT.PlayerState.ENDED) {
                const active = propsRef.current.program.youtubePlaylistId
                if (active) {
                  const ids = event.target.getPlaylist() ?? []
                  const index = (event.target as YTPlayer & { getPlaylistIndex: () => number }).getPlaylistIndex()
                  // The iframe API advances through the playlist itself. Only
                  // leave the channel when the final playlist item has ended.
                  if (index < ids.length - 1) return
                }
                propsRef.current.onEnded()
              }
            },
            onError: (event) => propsRef.current.onError(`youtube ${event.data}`),
          },
        })
      })
      .catch(() => propsRef.current.onError())
    return () => {
      dead = true
      try {
        player.current?.destroy()
      } catch {
        /* already gone */
      }
      player.current = null
    }
  }, [props.program.youtubeId, props.program.youtubePlaylistId])
  useEffect(() => {
    const current = player.current
    if (!current?.mute) return
    if (props.muted) current.mute()
    else {
      current.unMute()
      current.setVolume(Math.round(props.volume * 100))
    }
    try {
      current.setPlaybackRate(props.rate)
    } catch {
      /* ignore */
    }
  }, [props.muted, props.volume, props.rate])
  return (
    <div className="yt-slot absolute inset-0" data-testid="youtube-player">
      <div ref={host} className="h-full w-full" />
    </div>
  )
}

function VimeoVideo(props: EngineProps) {
  const host = useRef<HTMLDivElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  useEffect(() => {
    const node = host.current
    const id = Number(props.program.vimeoId)
    const offset = props.offsetSec
    if (!node || !id) return
    let dead = false
    let destroy: (() => void) | null = null
    void import('@vimeo/player').then(({ default: Player }) => {
      if (dead) return
      const current = propsRef.current
      const player = new Player(node, {
        id,
        autoplay: true,
        muted: current.muted,
        controls: true,
        dnt: true,
      })
      destroy = () => {
        void player.destroy()
      }
      void player.ready().then(async () => {
        if (offset > 1) await player.setCurrentTime(offset).catch(() => undefined)
        try {
          await player.setPlaybackRate(propsRef.current.rate)
        } catch {
          /* some videos lock the rate */
        }
        await player.play().catch(() => undefined)
        propsRef.current.onStarted()
      })
      player.on('ended', () => propsRef.current.onEnded())
      player.on('error', () => propsRef.current.onError())
    }).catch(() => propsRef.current.onError())
    return () => {
      dead = true
      destroy?.()
    }
  }, [props.program.vimeoId])
  return (
    <div className="vm-slot absolute inset-0" data-testid="vimeo-player">
      <div ref={host} className="h-full w-full" />
    </div>
  )
}

function DailymotionVideo(props: EngineProps) {
  const id = props.program.dailymotionId
  const start = useRef(Math.floor(props.offsetSec)).current
  const src = `https://www.dailymotion.com/embed/video/${id}?autoplay=1&mute=${props.muted ? 1 : 0}&start=${start}&queue-enable=0`
  return (
    <iframe
      data-testid="dailymotion-player"
      title={props.program.title}
      src={src}
      className="h-full w-full"
      allow="autoplay; fullscreen"
      allowFullScreen
      onLoad={props.onStarted}
    />
  )
}


function CastButton({ program, offsetSec }: { program: Program; offsetSec: number }) {
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const castRef = useRef<any>(null)

  useEffect(() => {
    const w = window as any
    const ready = () => {
      if (!w.cast?.framework) return
      castRef.current = w.cast.framework.CastContext.getInstance()
      castRef.current.setOptions({
        receiverApplicationId: 'CC1AD845',
        autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
      })
      setAvailable(true)
    }
    if (w.cast?.framework) {
      ready()
      return
    }
    w.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) ready()
    }
    const existing = document.querySelector('script[data-google-cast-sdk]')
    if (!existing) {
      const script = document.createElement('script')
      script.dataset.googleCastSdk = 'true'
      script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1'
      script.async = true
      document.head.appendChild(script)
    }
    return () => { w.__onGCastApiAvailable = undefined }
  }, [])

  if (!program.playUrl) return null

  async function cast() {
    const w = window as any
    const context = castRef.current
    if (!context || !available) {
      setMessage('Cast requires a supported Chrome browser.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const session = await context.requestSession()
      const url = new URL(program.playUrl!, window.location.href).href
      const path = new URL(url).pathname.toLowerCase()
      const mimeType = path.endsWith('.m3u8') ? 'application/x-mpegURL'
        : path.endsWith('.webm') ? 'video/webm'
          : path.endsWith('.mpd') ? 'application/dash+xml'
            : 'video/mp4'
      const media = new w.chrome.cast.media.MediaInfo(url, mimeType)
      media.streamType = w.chrome.cast.media.StreamType.BUFFERED
      const metadata = new w.chrome.cast.media.GenericMediaMetadata()
      metadata.title = program.title
      media.metadata = metadata
      const request = new w.chrome.cast.media.LoadRequest(media)
      request.currentTime = Math.max(0, offsetSec)
      await session.loadMedia(request)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start casting.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" data-testid="cast-button" disabled={busy}
        onClick={() => void cast()}
        className="bevel flex items-center gap-1 rounded-sm bg-[#1b2333] px-3 py-2 font-mono text-[10px] font-bold text-yellow-300 disabled:opacity-50">
        <Cast className="size-4" /> {busy ? 'CONNECTING' : 'CAST'}
      </button>
      {message && <span role="status" className="max-w-40 text-right font-mono text-[9px] text-amber-200">{message}</span>}
    </div>
  )
}

interface EngineProps {
  program: Program
  offsetSec: number
  muted: boolean
  volume: number
  rate: number
  onStarted: () => void
  onError: (message?: string) => void
  onBuffering: () => void
  onEnded: () => void
}

function Engine(props: EngineProps) {
  const { program } = props
  if (program.youtubeId) return <YouTubeVideo {...props} />
  if (program.vimeoId) return <VimeoVideo {...props} />
  if (program.dailymotionId) return <DailymotionVideo {...props} />
  if (program.source === 'hls' || program.playUrl?.includes('.m3u8')) return <HlsVideo {...props} />
  if (program.source === 'dash' || program.playUrl?.includes('.mpd')) return <DashVideo {...props} />
  if (program.playUrl) return <FileVideo {...props} />
  return null
}

export function Player({
  channel,
  now,
  vod,
  onExitVod,
  muted,
  volume,
  rate,
  crt,
  aspect,
  showLogo,
  onUnmute,
  screenRef,
}: {
  channel: Channel | null
  now: number
  vod: Program | null
  onExitVod: () => void
  muted: boolean
  volume: number
  rate: number
  crt: boolean
  aspect: '16:9' | '4:3'
  showLogo: boolean
  onUnmute: () => void
  screenRef?: RefObject<HTMLDivElement | null>
}) {
  const shell = useRef<HTMLDivElement>(null)
  const frame = screenRef ?? shell
  const [staticOn, setStaticOn] = useState(false)
  const [started, setStarted] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reason, setReason] = useState('')
  const [held, setHeld] = useState(false)
  const [rewind, setRewind] = useState(false)
  const [retry, setRetry] = useState(0)
  const [played, setPlayed] = useState(0)

  const live = channel ? liveSlot(channel, now) : null
  const upcoming = channel ? nextSlot(channel, now) : null
  const target: PlayTarget | null = vod
    ? { key: `vod-${vod.id}`, program: vod, offsetSec: 0, live: false }
    : rewind && live
      ? { key: `rewind-${live.program.id}-${live.startMs}`, program: live.program, offsetSec: 0, live: false }
      : live
        ? { key: `live-${live.program.id}-${live.startMs}`, program: live.program, offsetSec: live.offsetSec, live: true }
        : null

  useEffect(() => {
    setStaticOn(true)
    const timer = window.setTimeout(() => setStaticOn(false), 650)
    return () => window.clearTimeout(timer)
  }, [channel?.id])

  useEffect(() => {
    setStarted(false)
    setBuffering(false)
    setFailed(false)
    setHeld(false)
    setPlayed(target?.offsetSec ?? 0)
    setReason('')
    // Offset is only the entry point. The live clock keeps moving after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.key, retry])

  // A player that never reaches "playing" should not spin forever on a TV browser.
  useEffect(() => {
    if (!target || started || failed || held) return
    const timer = window.setTimeout(() => {
      setReason('startup-timeout')
      setFailed(true)
    }, 25000)
    return () => window.clearTimeout(timer)
  }, [target?.key, retry, started, failed, held])

  useEffect(() => {
    if (!started || !target || target.live) return
    const timer = window.setInterval(() => setPlayed((value) => value + rate), 1000)
    return () => window.clearInterval(timer)
  }, [started, target?.key, target?.live, rate])

  const duration = target ? programDuration(target.program) : 0
  const position = target?.live && live
    ? Math.min(duration, Math.max(0, (now - live.startMs) / 1000))
    : Math.min(duration, played)
  const progress = duration ? Math.min(100, (position / duration) * 100) : 0
  const state = !target ? 'idle' : failed ? 'failed' : buffering ? 'buffering' : staticOn || !started ? 'tuning' : 'playing'
  const look = channel ? lookById(channel.look).bug : ''

  return (
    <div
      ref={frame}
      data-testid="crt-player"
      className="relative overflow-hidden rounded-[18px] border-[10px] border-[#151a26] bg-black shadow-[0_0_0_2px_#000,0_25px_60px_-20px_rgba(0,0,0,0.9),inset_0_0_40px_rgba(0,0,0,0.9)]"
    >
      <div className="relative aspect-video bg-black" data-testid="playback" data-state={state} data-reason={reason}>
        <div className={`absolute inset-0 flex justify-center ${aspect === '4:3' ? '' : ''}`}>
          <div className={`relative h-full ${aspect === '4:3' ? 'aspect-[4/3]' : 'w-full'}`}>
            {target && !failed && (
              <Engine
                key={`${target.key}-${retry}`}
                program={target.program}
                offsetSec={target.offsetSec}
                muted={muted}
                volume={volume}
                rate={rate}
                onStarted={() => {
                  setStarted(true)
                  setBuffering(false)
                }}
                onError={(message) => {
                  setReason(message ?? 'error')
                  setFailed(true)
                }}
                onBuffering={() => setBuffering(true)}
                onEnded={() => setHeld(true)}
              />
            )}
          </div>
        </div>
        {(failed || held || !target) && !staticOn && (
          <div
            data-testid="player-standby"
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-[#000066] to-[#002288] px-4 text-center"
          >
            {channel && (
              <span className={`hidden rounded-sm border px-3 py-1 font-heading text-sm font-extrabold tracking-widest sm:inline-block ${look}`}>
                CH {padChannel(channel.number)} · {channel.callsign}
              </span>
            )}
            <p data-testid="player-standby-title" className="font-mono text-xl font-bold text-prevue-yellow text-glow sm:text-2xl">
              {failed ? 'SIGNAL LOST' : !target ? 'OFF THE AIR' : 'STAY TUNED'}
            </p>
            <p className="max-w-md font-mono text-sm text-blue-100">
              {failed
                ? reason.startsWith('youtube')
                  ? 'YouTube blocked this picture. Try another video, or open it on YouTube.'
                  : reason === 'startup-timeout'
                    ? 'The stream did not start in time. Try again or flip the channel.'
                    : reason === 'autoplay-blocked'
                      ? 'The browser blocked automatic playback. Press Try Again, or start playback from the player.'
                      : 'This one will not play in the browser. Try again, or flip the channel.'
                : !target
                  ? 'Nothing is scheduled. Tap a channel and add some shows.'
                  : upcoming
                    ? `Next up at ${clock(upcoming.startMs)}.`
                    : 'The next show is coming.'}
            </p>
            {failed && (
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  data-testid="signal-lost-retry-button"
                  className="bevel rounded-sm bg-yellow-400 px-4 py-2 font-mono text-sm font-bold text-black"
                  onClick={() => {
                    setFailed(false)
                    setStarted(false)
                    setRetry((value) => value + 1)
                  }}
                >
                  TRY AGAIN
                </button>
                {target?.program.pageUrl && (
                  <a
                    className="inline-flex items-center gap-1 font-mono text-sm text-sky-300 underline"
                    href={target.program.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open the source <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}
        {staticOn && channel && (
          <div data-testid="channel-static" className="absolute inset-0 z-30">
            <StaticSnow />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-black/70 px-4 py-2 font-mono text-4xl font-bold text-green-400 sm:text-5xl">
                {padChannel(channel.number)}
              </span>
            </div>
          </div>
        )}
        {channel && showLogo && target && !failed && (
          <button
            type="button"
            data-testid="channel-bug"
            className="absolute bottom-3 right-3 z-20 opacity-70 mix-blend-screen"
            onClick={(event) => event.stopPropagation()}
            title={channel.name}
          >
            <span className={`flex flex-col items-center rounded-[3px] border-2 px-1.5 py-0.5 leading-none ${look}`}>
              <span className="font-heading text-sm font-black italic tracking-tight sm:text-xl">{channel.callsign}</span>
              <span className="font-mono text-[8px] font-bold tracking-[0.2em]">{padChannel(channel.number)}</span>
            </span>
          </button>
        )}
        {target?.program.playUrl && !failed && !staticOn && (
          <div className="absolute bottom-3 left-3 z-40">
            <CastButton program={target.program} offsetSec={position} />
          </div>
        )}
        {channel && (
          <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-2 font-mono text-xs sm:text-sm">
            <span data-testid="osd-channel" className="bg-black/60 px-2 py-0.5 font-bold text-green-400">
              CH {padChannel(channel.number)} {channel.callsign}
            </span>
            <span data-testid="osd-live" className="flex items-center gap-1 bg-black/60 px-2 py-0.5 font-bold text-white">
              {target?.live && !held ? (
                <>
                  <span className="size-2 animate-blink rounded-full bg-red-500" /> LIVE
                </>
              ) : (
                'FROM START'
              )}
            </span>
          </div>
        )}
        {target && muted && !staticOn && !failed && (
          <button
            type="button"
            data-testid="tap-for-sound-button"
            onClick={onUnmute}
            className="absolute right-3 top-3 z-20 bg-yellow-400 px-3 py-2 font-mono text-xs font-bold text-black"
          >
            TAP FOR SOUND
          </button>
        )}
        {(state === 'tuning' || state === 'buffering') && target && !staticOn && (
          <span
            data-testid="buffering-indicator"
            className="pointer-events-none absolute bottom-3 left-3 z-20 bg-black/70 px-2 py-1 font-mono text-[10px] font-bold text-yellow-300"
          >
            BUFFERING
          </span>
        )}
        {crt && <div data-testid="crt-overlay" className="pointer-events-none absolute inset-0 z-10 crt-scanlines animate-flicker" />}
        {crt && <div className="pointer-events-none absolute inset-0 z-10 crt-vignette" />}
      </div>
      <div className="relative z-10 border-t-2 border-black bg-gradient-to-r from-[#001144] via-[#002288] to-[#001144] px-4 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200">
              {vod ? 'On Demand' : 'Now Playing'}
            </p>
            <p data-testid="now-playing-title" className="truncate font-heading text-base font-bold uppercase text-prevue-yellow sm:text-lg">
              {target ? target.program.title : channel ? 'Off the air' : 'Make a channel'}
            </p>
            {upcoming && !vod && (
              <p data-testid="up-next" className="truncate font-mono text-[11px] text-blue-100">
                Next {clock(upcoming.startMs)} · {upcoming.program.title}
              </p>
            )}
            {target?.program.source === 'youtube' && (
              <p className="font-mono text-[10px] text-blue-200">YouTube may play an ad first. The ad stays.</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
            {vod && (
              <button type="button" className="bevel rounded-sm bg-red-600 px-2 py-1 font-mono text-[10px] font-bold text-white" onClick={onExitVod}>
                BACK TO LIVE
              </button>
            )}
            {target && <CastButton program={target.program} offsetSec={position} />}
            {target && !vod && started && position > 8 && (
              <button
                type="button"
                data-testid="start-over-button"
                className="bevel flex items-center gap-1 rounded-sm bg-[#001144] px-2 py-1 font-mono text-[10px] font-bold text-yellow-300"
                onClick={() => {
                  setRewind(true)
                  setHeld(false)
                }}
              >
                <RotateCcw className="size-3" /> START OVER
              </button>
            )}
            {rewind && !vod && (
              <button
                type="button"
                data-testid="go-live-button"
                className="bevel flex items-center gap-1 rounded-sm bg-red-600 px-2 py-1 font-mono text-[10px] font-bold text-white"
                onClick={() => setRewind(false)}
              >
                <Play className="size-3" /> GO LIVE
              </button>
            )}
            <p data-testid="now-playing-time" className="font-mono text-xs text-blue-100 tabular-nums">
              {target ? `${mmss(position)} / ${mmss(duration)}` : '--:--'}
            </p>
          </div>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden bg-black/50">
          <div data-testid="now-playing-progress" className="h-full bg-yellow-400" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  )
}

export async function requestFullscreen(node: HTMLElement | null) {
  if (!node) return
  if (document.fullscreenElement) await document.exitFullscreen()
  else await node.requestFullscreen().catch(() => undefined)
}
