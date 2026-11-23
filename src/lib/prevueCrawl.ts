import { useEffect, useState, type RefObject } from 'react'

const CRAWL_PIXELS_PER_SECOND = 14
const SCREENFUL_PAUSE_MS = 4000
const USER_PAUSE_MS = 10000

/**
 * Recreates the Prevue grid's slow upward channel crawl. The first copy is
 * measured against its viewport; a second copy makes the wrap seamless.
 * The crawl pauses for four seconds after each screenful and briefly after
 * keyboard, remote, wheel, pointer, or touch interaction.
 */
export function usePrevueCrawl(
  viewportRef: RefObject<HTMLElement | null>,
  firstCopyRef: RefObject<HTMLElement | null>,
  enabled = true,
): boolean {
  const [looping, setLooping] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    const firstCopy = firstCopyRef.current
    if (!enabled || !viewport || !firstCopy) {
      setLooping(false)
      return
    }

    const measure = () => {
      setLooping(viewport.clientHeight > 0 && firstCopy.scrollHeight > viewport.clientHeight + 2)
    }

    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(viewport)
    observer?.observe(firstCopy)
    window.addEventListener('resize', measure)

    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [enabled, viewportRef, firstCopyRef])

  useEffect(() => {
    if (!looping) return
    const viewport = viewportRef.current
    const firstCopy = firstCopyRef.current
    if (!viewport || !firstCopy) return

    let frame = 0
    let previousFrame = 0
    let distanceSincePause = 0
    let screenPauseUntil = 0
    let interactionPauseUntil = 0

    const pauseForInteraction = () => {
      interactionPauseUntil = performance.now() + USER_PAUSE_MS
      previousFrame = 0
    }

    const tick = (timestamp: number) => {
      const elapsed = previousFrame ? Math.min((timestamp - previousFrame) / 1000, 0.05) : 0
      previousFrame = timestamp
      const loopHeight = firstCopy.scrollHeight

      if (loopHeight > viewport.clientHeight + 2) {
        if (timestamp >= screenPauseUntil && timestamp >= interactionPauseUntil) {
          const distance = CRAWL_PIXELS_PER_SECOND * elapsed
          viewport.scrollTop += distance
          distanceSincePause += distance
          while (viewport.scrollTop >= loopHeight) viewport.scrollTop -= loopHeight

          if (distanceSincePause >= viewport.clientHeight) {
            distanceSincePause = 0
            screenPauseUntil = timestamp + SCREENFUL_PAUSE_MS
          }
        } else {
          while (viewport.scrollTop >= loopHeight) viewport.scrollTop -= loopHeight
        }
      }

      frame = window.requestAnimationFrame(tick)
    }

    viewport.addEventListener('wheel', pauseForInteraction, { passive: true })
    viewport.addEventListener('touchstart', pauseForInteraction, { passive: true })
    viewport.addEventListener('pointerdown', pauseForInteraction, { passive: true })
    viewport.addEventListener('keydown', pauseForInteraction)
    frame = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frame)
      viewport.removeEventListener('wheel', pauseForInteraction)
      viewport.removeEventListener('touchstart', pauseForInteraction)
      viewport.removeEventListener('pointerdown', pauseForInteraction)
      viewport.removeEventListener('keydown', pauseForInteraction)
    }
  }, [looping, viewportRef, firstCopyRef])

  return looping
}
