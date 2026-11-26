import type { Channel, Network, Program } from '../types.ts'
import { tapeKey } from './rules.ts'
import { liveSlot, onAirPrograms } from './schedule.ts'

export function onAir(channel: Channel): Program[] {
  return channel.programs.filter((program) => !program.retired)
}

export function retirePrograms(channel: Channel, ids: string[], reason: string): Channel {
  const drop = new Set(ids)
  return {
    ...channel,
    programs: channel.programs.map((program) =>
      drop.has(program.id) ? { ...program, retired: true, retiredReason: reason } : program,
    ),
  }
}

export function retireWholeTape(channel: Channel, program: Program): Channel {
  return {
    ...channel,
    programs: channel.programs.map((item) =>
      item.remoteId && item.remoteId === program.remoteId
        ? { ...item, retired: true, retiredReason: 'whole tape pulled' }
        : item,
    ),
  }
}

export function restorePrograms(channel: Channel, ids: string[], protect: boolean): Channel {
  const back = new Set(ids)
  return {
    ...channel,
    programs: channel.programs.map((program) =>
      back.has(program.id) ? { ...program, retired: false, retiredReason: undefined, keep: protect || program.keep } : program,
    ),
  }
}

export function moveProgram(network: Network, programId: string, toChannelId: string): Network {
  let moving: Program | undefined
  const stripped = network.channels.map((channel) => {
    const found = channel.programs.find((program) => program.id === programId)
    if (!found) return channel
    moving = found
    return { ...channel, programs: channel.programs.filter((program) => program.id !== programId) }
  })
  if (!moving) return network
  const tape = moving
  return {
    ...network,
    channels: stripped.map((channel) =>
      channel.id === toChannelId ? { ...channel, programs: [...channel.programs, tape] } : channel,
    ),
  }
}

export function mergeChannels(network: Network, fromId: string, intoId: string): Network {
  const source = network.channels.find((channel) => channel.id === fromId)
  const target = network.channels.find((channel) => channel.id === intoId)
  if (!source || !target || fromId === intoId) return network
  const have = new Set(target.programs.map(tapeKey))
  const moved = source.programs.filter((program) => !have.has(tapeKey(program)))
  return {
    ...network,
    channels: network.channels.map((channel) => {
      if (channel.id === intoId) return { ...channel, programs: [...channel.programs, ...moved] }
      if (channel.id === fromId) return { ...channel, programs: [], signedOff: true }
      return channel
    }),
  }
}

export interface DuplicateHit {
  key: string
  title: string
  copies: Array<{ channelName: string; programId: string; keep: boolean }>
}

export function findDuplicates(network: Network): DuplicateHit[] {
  const groups = new Map<string, DuplicateHit>()
  for (const channel of network.channels) {
    if (channel.signedOff) continue
    for (const program of channel.programs) {
      if (program.retired) continue
      const key = tapeKey(program)
      const group = groups.get(key) ?? { key, title: program.title, copies: [] }
      group.copies.push({ channelName: channel.name, programId: program.id, keep: !!program.keep })
      groups.set(key, group)
    }
  }
  return [...groups.values()].filter((group) => group.copies.length > 1)
}

export function fixDuplicates(network: Network): { network: Network; pulled: number } {
  const drop = new Set<string>()
  for (const group of findDuplicates(network)) {
    const keeper = group.copies.find((copy) => copy.keep) ?? group.copies[0]
    for (const copy of group.copies) {
      if (copy.programId !== keeper.programId) drop.add(copy.programId)
    }
  }
  return {
    pulled: drop.size,
    network: {
      ...network,
      channels: network.channels.map((channel) => ({
        ...channel,
        programs: channel.programs.map((program) =>
          drop.has(program.id) ? { ...program, retired: true, retiredReason: 'duplicate on another channel' } : program,
        ),
      })),
    },
  }
}

export function reorder(channel: Channel, programId: string, direction: -1 | 1): Channel {
  const index = channel.programs.findIndex((program) => program.id === programId)
  const next = index + direction
  if (index < 0 || next < 0 || next >= channel.programs.length) return channel
  const programs = channel.programs.slice()
  const [item] = programs.splice(index, 1)
  programs.splice(next, 0, item)
  return { ...channel, programs }
}

export function shufflePrograms(channel: Channel): Channel {
  const programs = channel.programs.slice()
  for (let index = programs.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1))
    const current = programs[index]
    programs[index] = programs[swap]
    programs[swap] = current
  }
  return { ...channel, programs }
}

export function playNext(channel: Channel, programId: string, nowMs: number): Channel {
  const airing = onAirPrograms(channel, nowMs)
  const live = liveSlot(channel, nowMs)
  const chosen = airing.find((program) => program.id === programId)
  if (!chosen) return channel
  const current = airing.find((program) => program.id === live?.program.id && program.id !== chosen.id)
  const rest = airing.filter((program) => program.id !== chosen.id && program.id !== current?.id)
  const retired = channel.programs.filter((program) => program.retired)
  const seen = new Set<string>()
  const programs = [current, chosen, ...rest, ...retired].filter((program): program is Program => {
    if (!program || seen.has(program.id)) return false
    seen.add(program.id)
    return true
  })
  return { ...channel, programs }
}
