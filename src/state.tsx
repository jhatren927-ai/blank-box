import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { hashPin, newSalt } from './lib/pin.ts'
import { clearSeed, freshNetwork, loadNetwork, loadPrefs, writeNetwork, writePrefs } from './lib/storage.ts'
import type { Channel, Network, Prefs } from './types.ts'

interface Store {
  network: Network
  prefs: Prefs
  unlocked: boolean
  unlock: () => void
  setName: (name: string) => void
  saveChannel: (channel: Channel) => void
  deleteChannel: (id: string) => void
  replaceNetwork: (network: Network) => void
  reset: () => void
  setPin: (pin: string | null) => Promise<void>
  patchPrefs: (partial: Partial<Prefs>) => void
  toggleFav: (id: string) => void
  remember: (id: string) => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<Network>(() => loadNetwork())
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs())
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem('blankbox-open') === '1' || !loadNetwork().pin)

  useEffect(() => {
    writeNetwork(network)
  }, [network])
  useEffect(() => {
    writePrefs(prefs)
  }, [prefs])

  const store = useMemo<Store>(
    () => ({
      network,
      prefs,
      unlocked,
      unlock() {
        sessionStorage.setItem('blankbox-open', '1')
        setUnlocked(true)
      },
      setName(name) {
        setNetwork((current) => ({ ...current, name }))
      },
      saveChannel(channel) {
        setNetwork((current) => ({
          ...current,
          channels: current.channels.some((item) => item.id === channel.id)
            ? current.channels.map((item) => (item.id === channel.id ? channel : item))
            : [...current.channels, channel],
        }))
      },
      deleteChannel(id) {
        setNetwork((current) => ({
          ...current,
          channels: current.channels.filter((channel) => channel.id !== id),
        }))
        setPrefs((current) => ({
          ...current,
          favs: current.favs.filter((item) => item !== id),
          recent: current.recent.filter((item) => item !== id),
        }))
      },
      replaceNetwork(next) {
        setNetwork(next)
        if (next.pin) {
          sessionStorage.removeItem('blankbox-open')
          setUnlocked(false)
        } else {
          sessionStorage.setItem('blankbox-open', '1')
          setUnlocked(true)
        }
      },
      reset() {
        clearSeed()
        const next = freshNetwork()
        setNetwork(next)
        sessionStorage.setItem('blankbox-open', '1')
        setUnlocked(true)
      },
      async setPin(pin) {
        if (!pin) {
          setNetwork((current) => ({ ...current, pin: null }))
          return
        }
        const salt = newSalt()
        const hash = await hashPin(pin, salt)
        setNetwork((current) => ({ ...current, pin: { salt, hash } }))
        sessionStorage.setItem('blankbox-open', '1')
        setUnlocked(true)
      },
      patchPrefs(partial) {
        setPrefs((current) => ({ ...current, ...partial }))
      },
      toggleFav(id) {
        setPrefs((current) => ({
          ...current,
          favs: current.favs.includes(id)
            ? current.favs.filter((item) => item !== id)
            : [...current.favs, id],
        }))
      },
      remember(id) {
        setPrefs((current) => ({
          ...current,
          recent: [id, ...current.recent.filter((item) => item !== id)].slice(0, 8),
        }))
      },
    }),
    [network, prefs, unlocked],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreContext)
  if (!store) throw new Error('Store missing')
  return store
}
