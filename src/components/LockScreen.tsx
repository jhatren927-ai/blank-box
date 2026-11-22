import { useRef, useState } from 'react'
import { hashPin } from '../lib/pin.ts'
import type { Network } from '../types.ts'

export function LockScreen({
  network,
  onUnlock,
  onClear,
}: {
  network: Network
  onUnlock: () => void
  onClear: () => void
}) {
  const [digits, setDigits] = useState('')
  const [error, setError] = useState<string | null>(null)
  const hold = useRef<number | null>(null)

  async function push(digit: string) {
    const next = (digits + digit).slice(0, 4)
    setDigits(next)
    setError(null)
    if (next.length === 4 && network.pin) {
      const hash = await hashPin(next, network.pin.salt)
      if (hash === network.pin.hash) onUnlock()
      else {
        setError("That's not the lock. Try again.")
        setDigits('')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#0a0e18] px-4 text-center">
      <p className="font-heading text-sm font-black uppercase tracking-[0.3em] text-slate-500">Blank Box</p>
      <h1 className="mt-2 font-heading text-4xl font-black uppercase text-prevue-yellow">{network.name}</h1>
      <p className="mt-2 font-mono text-sm text-slate-300">Type the 4-digit lock.</p>
      <div className="mt-4 flex gap-3" data-testid="pin-dots">
        {Array.from({ length: 4 }, (_, index) => (
          <span key={index} className={`h-4 w-4 rounded-full ${index < digits.length ? 'bg-yellow-300' : 'bg-slate-700'}`} />
        ))}
      </div>
      {error && <p className="mt-3 font-mono text-sm text-red-300">{error}</p>}
      <div className="mt-6 grid w-full max-w-xs grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((key) => (
          <button
            key={key}
            type="button"
            className="h-16 rounded-sm bg-[#1b2333] font-mono text-2xl font-bold text-white"
            onClick={() => {
              if (key === 'C' || key === '⌫') setDigits('')
              else void push(key)
            }}
          >
            {key}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="mt-8 font-mono text-xs text-slate-500"
        onPointerDown={() => {
          hold.current = window.setTimeout(() => {
            onClear()
          }, 3000)
        }}
        onPointerUp={() => {
          if (hold.current) window.clearTimeout(hold.current)
        }}
        onPointerLeave={() => {
          if (hold.current) window.clearTimeout(hold.current)
        }}
      >
        Hold for 3 seconds to erase the lock. Channels stay.
      </button>
    </div>
  )
}
