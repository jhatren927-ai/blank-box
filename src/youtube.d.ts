interface YTPlayer {
  destroy(): void
  playVideo(): void
  mute(): void
  unMute(): void
  setVolume(volume: number): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getDuration(): number
  getPlaylist(): string[] | null
  setPlaybackRate(rate: number): void
}

interface YTEvent {
  target: YTPlayer
  data: number
}

interface YTPlayerOptions {
  width?: number
  height?: number
  videoId?: string
  playerVars?: Record<string, string | number>
  events?: {
    onReady?: (event: YTEvent) => void
    onStateChange?: (event: YTEvent) => void
    onError?: (event: YTEvent) => void
  }
}

interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer
  PlayerState: {
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

interface Window {
  YT?: YTNamespace
  onYouTubeIframeAPIReady?: () => void
}
