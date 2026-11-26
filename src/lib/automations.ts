import type { Automation, AutoLog, Network, Program, SourceId } from '../types.ts'
import { adapterFor } from '../sources/index.ts'
import { uid } from './format.ts'
import { shufflePrograms } from './lineup.ts'
import { judge, tapeKey } from './rules.ts'

const OPEN_KEY = 'blankbox-auto-open'

function entry(automation: Automation, message: string): AutoLog {
  return { id: uid(), at: Date.now(), automationId: automation.id, message }
}

function isDue(automation: Automation, now: number): boolean {
  if (!automation.enabled) return false
  const last = automation.lastRun ?? 0
  if (automation.when === 'open') return sessionStorage.getItem(`${OPEN_KEY}:${automation.id}`) !== new Date(now).toDateString()
  if (automation.when === 'hourly') return now - last > 60 * 60 * 1000
  if (automation.when === 'daily') return now - last > 24 * 60 * 60 * 1000
  return now - last > 7 * 24 * 60 * 60 * 1000
}

async function searchAdd(network: Network, channelId: string, source: SourceId, query: string, limit: number) {
  const adapter = adapterFor(source)
  const channel = network.channels.find((item) => item.id === channelId)
  if (!adapter?.search || !adapter.fromHit || !channel || !query.trim() || limit <= 0) {
    return { network, added: 0, skipped: 0 }
  }
  const hits = await adapter.search(query.trim(), { page: 1, archiveAll: false, hideAdult: true })
  let added = 0
  let skipped = 0
  let next = network
  const have = new Set(channel.programs.map(tapeKey))
  for (const hit of hits) {
    if (added >= limit) break
    if (have.has(`${hit.source}:${hit.id}`)) continue
    const program = await adapter.fromHit(hit)
    if (!program) {
      skipped += 1
      continue
    }
    const current = next.channels.find((item) => item.id === channelId)
    if (!current) break
    if (!judge(program, current, next).pass) {
      skipped += 1
      continue
    }
    have.add(tapeKey(program))
    next = {
      ...next,
      channels: next.channels.map((item) =>
        item.id === channelId ? { ...item, programs: [...item.programs, program] } : item,
      ),
    }
    added += 1
  }
  return { network: next, added, skipped }
}

async function linkLooksDead(program: Program): Promise<boolean> {
  try {
    if (program.youtubeId) {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${program.youtubeId}`)}&format=json`)
      return response.status === 404 || response.status === 401
    }
    if (program.vimeoId) {
      const response = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${program.vimeoId}`)}`)
      return response.status === 404
    }
    if (program.dailymotionId) {
      const response = await fetch(`https://api.dailymotion.com/video/${program.dailymotionId}?fields=id`)
      return response.status === 404
    }
    if (program.source === 'archive') {
      const response = await fetch(`https://archive.org/metadata/${encodeURIComponent(program.remoteId)}`)
      return response.status === 404
    }
    if (program.playUrl) {
      const response = await fetch(program.playUrl, { method: 'HEAD' })
      return response.status === 404 || response.status === 410
    }
  } catch {
    return false
  }
  return false
}

export async function checkDeadLinks(network: Network): Promise<{ network: Network; pulled: number }> {
  let pulled = 0
  const channels = []
  for (const channel of network.channels) {
    const programs: Program[] = []
    for (const program of channel.programs) {
      if (program.retired || program.keep) {
        programs.push(program)
        continue
      }
      if (await linkLooksDead(program)) {
        pulled += 1
        programs.push({ ...program, retired: true, retiredReason: 'link did not open' })
      } else programs.push(program)
    }
    channels.push({ ...channel, programs })
  }
  return { network: { ...network, channels }, pulled }
}

function stamp(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

export async function runAutomation(network: Network, automation: Automation, now = Date.now()): Promise<Network> {
  const channel = network.channels.find((item) => item.id === automation.channelId)
  let next = network
  let message = 'Nothing to do.'
  const action = automation.action
  if (action.kind === 'autofill' && channel) {
    const have = channel.programs.filter((program) => !program.retired).length
    const need = Math.max(0, action.target - have)
    const result = await searchAdd(network, channel.id, action.source, action.query, need)
    next = result.network
    message = need === 0 ? `${channel.name} is already full.` : `Added ${result.added} tapes to ${channel.name}. Skipped ${result.skipped}.`
  } else if (action.kind === 'refresh' && channel) {
    const result = await searchAdd(network, channel.id, action.source, action.query, 8)
    next = result.network
    message = `Refresh added ${result.added} new tapes to ${channel.name}.`
  } else if (action.kind === 'retire-dead') {
    const result = await checkDeadLinks(network)
    next = result.network
    message = result.pulled ? `Pulled ${result.pulled} broken tapes.` : 'Every link still opens.'
  } else if (action.kind === 'shuffle' && channel) {
    next = { ...network, channels: network.channels.map((item) => (item.id === channel.id ? shufflePrograms(item) : item)) }
    message = `Shuffled ${channel.name}.`
  } else if (action.kind === 'daypart' && channel) {
    next = {
      ...network,
      channels: network.channels.map((item) =>
        item.id === channel.id
          ? { ...item, daypart: { morningWords: action.morningWords, nightWords: action.nightWords, nightHour: action.nightHour } }
          : item,
      ),
    }
    message = `${channel.name} plays “${action.morningWords || 'anything'}” until ${action.nightHour}:00, then “${action.nightWords || 'anything'}”.`
  } else if (action.kind === 'takeover' && channel) {
    const today = stamp(now)
    const active = !!action.from && !!action.to && today >= action.from && today <= action.to
    if (active && !channel.takeover) {
      const result = await searchAdd(network, channel.id, action.source, action.query, 12)
      next = {
        ...result.network,
        channels: result.network.channels.map((item) =>
          item.id === channel.id ? { ...item, takeover: { from: action.from, to: action.to, label: action.label, stash: channel.programs } } : item,
        ),
      }
      message = `${action.label} is on ${channel.name} until ${action.to}. Added ${result.added} tapes.`
    } else if (!active && channel.takeover) {
      next = {
        ...network,
        channels: network.channels.map((item) =>
          item.id === channel.id ? { ...item, programs: item.takeover?.stash ?? item.programs, takeover: null } : item,
        ),
      }
      message = `${channel.takeover.label} is over. ${channel.name} is back to normal.`
    } else message = active ? `${action.label} is already on.` : `${action.label} is not on today's date.`
  }
  return {
    ...next,
    automations: (next.automations ?? []).map((item) => (item.id === automation.id ? { ...item, lastRun: now } : item)),
    automationLog: [entry(automation, message), ...(next.automationLog ?? [])].slice(0, 40),
  }
}

export async function runDue(network: Network, now = Date.now()): Promise<Network | null> {
  let next = network
  let changed = false
  for (const automation of network.automations ?? []) {
    if (!isDue(automation, now)) continue
    const current = (next.automations ?? []).find((item) => item.id === automation.id) ?? automation
    next = await runAutomation(next, current, now)
    if (automation.when === 'open') sessionStorage.setItem(`${OPEN_KEY}:${automation.id}`, new Date(now).toDateString())
    changed = true
  }
  return changed ? next : null
}
