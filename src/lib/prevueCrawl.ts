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

    let distanceSincePause = 0
    let fractionalDistance = 0
    let screenPauseUntil = 0
    let interactionPauseUntil = 0
    let previousTick = performance.now()

    const pauseForInteraction = () => {
      interactionPauseUntil = performance.now() + USER_PAUSE_MS
    }

    // Android TV WebViews can suspend animation frames beneath full-screen
    // overlays. A steady timer keeps the guide crawl moving on those devices.
    const tick = () => {
      const timestamp = performance.now()
      const elapsed = Math.min((timestamp - previousTick) / 1000, 0.25)
      previousTick = timestamp
      const loopHeight = firstCopy.scrollHeight

      if (loopHeight > viewport.clientHeight + 2 &&
          timestamp >= screenPauseUntil &&
          timestamp >= interactionPauseUntil) {
        fractionalDistance += CRAWL_PIXELS_PER_SECOND * elapsed
        // Older TV WebViews round scrollTop writes to integer pixels. Carry
        // sub-pixel movement forward instead of losing it on every timer tick.
        const wholePixels = Math.floor(fractionalDistance)
        if (wholePixels > 0) {
          viewport.scrollTop += wholePixels
          fractionalDistance -= wholePixels
          distanceSincePause += wholePixels
        }

        // The second identical lineup follows the first. Subtracting exactly
        // one lineup height creates a seamless wrap without jumping backwards.
        while (viewport.scrollTop >= loopHeight) viewport.scrollTop -= loopHeight

        if (distanceSincePause >= viewport.clientHeight) {
          distanceSincePause = 0
          screenPauseUntil = timestamp + SCREENFUL_PAUSE_MS
        }
      } else {
        while (viewport.scrollTop >= loopHeight) viewport.scrollTop -= loopHeight
      }
    }

    viewport.addEventListener('wheel', pauseForInteraction, { passive: true })
    viewport.addEventListener('touchstart', pauseForInteraction, { passive: true })
    viewport.addEventListener('pointerdown', pauseForInteraction, { passive: true })
    viewport.addEventListener('keydown', pauseForInteraction)

    const timer = window.setInterval(tick, 50)
    return () => {
      window.clearInterval(timer)
      viewport.removeEventListener('wheel', pauseForInteraction)
      viewport.removeEventListener('touchstart', pauseForInteraction)
      viewport.removeEventListener('pointerdown', pauseForInteraction)
      viewport.removeEventListener('keydown', pauseForInteraction)
    }
  }, [looping, viewportRef, firstCopyRef])

  return looping
}
