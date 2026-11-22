const LEFT = [
  'Moonbeam',
  'Rocket',
  'Sunny',
  'Pixel',
  'Thunder',
  'Lucky',
  'Cosmic',
  'Neon',
  'Panda',
  'Jelly',
  'Turbo',
  'Maple',
  'Bubble',
  'Honey',
  'Starlight',
  'Disco',
  'Comet',
  'Peach',
  'Noodle',
  'Velvet',
]
const RIGHT = [
  'Theater',
  'Network',
  'Station',
  'Channel',
  'Club',
  'Box',
  'Vision',
  'Hour',
  'Playhouse',
  'TV',
]

function hash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export function networkName(seed: string): string {
  const h = hash(seed)
  return `${LEFT[h % LEFT.length]} ${RIGHT[Math.floor(h / 7) % RIGHT.length]}`
}

const THEMES: Array<[RegExp, string]> = [
  [/horror|scary|monster|ghost/, 'Midnight Chiller'],
  [/game show|gameshow/, 'Big Prize Theater'],
  [/anime/, 'Toon Satellite'],
  [/cartoon|toon/, 'Toon Town'],
  [/talk/, 'Late Talk'],
  [/space|nasa|rocket|moon/, 'Orbit Theater'],
  [/animal|nature|duck|dog|cat|wild/, 'Wild Hour'],
  [/music|song|concert/, 'Hit Parade'],
  [/sport|wrestling|soccer|baseball/, 'Game Day'],
  [/science|experiment/, 'Wonder Lab'],
  [/train|car|truck|plane/, 'Go Go Depot'],
  [/cook|food|bake/, 'Kitchen Counter'],
  [/old movie|classic movie|silent/, 'Vault Theater'],
]

export function channelNameFromTheme(theme: string): string {
  const text = theme.trim().toLowerCase()
  for (const [pattern, name] of THEMES) {
    if (pattern.test(text)) return name
  }
  const titled = theme
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
  return (titled || 'My Channel').slice(0, 28)
}

export function callsignFrom(name: string): string {
  const word = name.trim().split(/\s+/)[0] ?? 'TV'
  const letters = word.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  return (letters || 'TV').slice(0, 6)
}
