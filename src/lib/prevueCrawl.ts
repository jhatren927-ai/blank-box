import { useEffect, useState, type RefObject } from 'react'

const CRAWL_PIXELS_PER_SECOND = 14
const SCREENFUL_PAUSE_MS = 4000
const USER_PAUSE_MS = 10000

/**
 * Recreates the Prevue grid's slow upward channel crawl. The first copy is
 * measured against its viewport; enough repeated copies fill the viewport and make the wrap seamless.
 * The crawl pauses for four seconds after each screenful and briefly while
 * the viewer selects or navigates a guide item.
 */
export function usePrevueCrawl(
  viewportRef: RefObject<HTMLElement | null>,
  firstCopyRef: RefObject<HTMLElement | null>,
  enabled = true,
): number {
  const [copyCount, setCopyCount] = useState(1)

  useEffect(() => {
    const viewport = viewportRef.current
    const firstCopy = firstCopyRef.current
    if (!enabled || !viewport || !firstCopy) {
      setCopyCount(1)
      return
    }

    const measure = () => {
      const rowHeight = firstCopy.scrollHeight
      const neededCopies = rowHeight > 0 && viewport.clientHeight > 0
        ? Math.max(2, Math.ceil(viewport.clientHeight / rowHeight) + 2)
        : 1
      setCopyCount(neededCopies)
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
    if (copyCount < 2) return
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

      if (loopHeight > 0 &&
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

        // Identical lineups follow one another. Subtracting exactly one
        // lineup height creates a seamless wrap, even for short channel lists.
        while (viewport.scrollTop >= loopHeight) viewport.scrollTop -= loopHeight

        if (distanceSincePause >= viewport.clientHeight) {
          distanceSincePause = 0
          screenPauseUntil = timestamp + SCREENFUL_PAUSE_MS
        }
      } else {
        while (viewport.scrollTop >= loopHeight) viewport.scrollTop -= loopHeight
      }
    }

    viewport.addEventListener('pointerdown', pauseForInteraction, { passive: true })
    viewport.addEventListener('keydown', pauseForInteraction)

    const timer = window.setInterval(tick, 50)
    return () => {
      window.clearInterval(timer)
      viewport.removeEventListener('pointerdown', pauseForInteraction)
      viewport.removeEventListener('keydown', pauseForInteraction)
    }
  }, [copyCount, viewportRef, firstCopyRef])

  return copyCount
}
