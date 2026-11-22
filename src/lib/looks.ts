export interface Look {
  id: string
  bug: string
}

export const LOOKS: Look[] = [
  { id: 'gold', bug: 'border-yellow-300 bg-red-800 text-yellow-100' },
  { id: 'ice', bug: 'border-cyan-200 bg-blue-950 text-cyan-100' },
  { id: 'lime', bug: 'border-lime-300 bg-green-900 text-lime-100' },
  { id: 'pink', bug: 'border-pink-300 bg-fuchsia-950 text-pink-100' },
  { id: 'orange', bug: 'border-orange-300 bg-orange-950 text-orange-100' },
  { id: 'paper', bug: 'border-white bg-black text-white' },
  { id: 'grape', bug: 'border-violet-300 bg-indigo-950 text-violet-100' },
  { id: 'sun', bug: 'border-amber-200 bg-yellow-900 text-amber-100' },
]

export function lookById(id: string): Look {
  return LOOKS.find((look) => look.id === id) ?? LOOKS[0]
}

export function lookForTheme(theme: string): Look {
  let hash = 0
  for (const char of theme.toLowerCase()) hash = Math.imul(hash, 33) + char.charCodeAt(0)
  return LOOKS[Math.abs(hash) % LOOKS.length]
}

export function nextLook(id: string): Look {
  const index = LOOKS.findIndex((look) => look.id === id)
  return LOOKS[(index + 1) % LOOKS.length]
}
