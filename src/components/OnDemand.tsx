import { useState } from 'react'
import type { Channel, Program } from '../types.ts'
import { lengthLabel, padChannel } from '../lib/format.ts'
import { lookById } from '../lib/looks.ts'

export function OnDemand({
  channels,
  onPlay,
}: {
  channels: Channel[]
  onPlay: (channelId: string, program: Program) => void
}) {
  const ordered = channels.slice().sort((a, b) => a.number - b.number)
  const [channelId, setChannelId] = useState(ordered[0]?.id ?? '')
  const channel = ordered.find((item) => item.id === channelId) ?? ordered[0]

  return (
    <section data-testid="on-demand" className="mx-auto max-w-5xl px-3 py-4">
      <h2 className="font-heading text-3xl font-black uppercase text-prevue-yellow">On Demand</h2>
      <p className="mt-1 font-mono text-sm text-slate-400">Pick a show and watch it from the start.</p>
      {ordered.length === 0 ? (
        <p className="mt-6 font-mono text-lg text-slate-300">Make a channel first. Then its shows show up here.</p>
      ) : (
        <>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {ordered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setChannelId(item.id)}
                className={`h-14 shrink-0 rounded-sm px-4 font-mono text-sm font-bold ${item.id === channel?.id ? 'bg-yellow-400 text-black' : 'bg-[#1b2333] text-white'}`}
              >
                {padChannel(item.number)} {item.callsign}
              </button>
            ))}
          </div>
          {channel && (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {channel.programs.map((program) => (
                <li key={program.id}>
                  <button
                    type="button"
                    onClick={() => onPlay(channel.id, program)}
                    className="flex h-full w-full items-center gap-3 rounded-sm bg-[#121827] p-3 text-left hover:bg-[#1b2740]"
                  >
                    {program.thumbnail ? (
                      <img src={program.thumbnail} alt="" className="h-16 w-28 shrink-0 rounded-sm object-cover" />
                    ) : (
                      <span className={`flex h-16 w-28 shrink-0 items-center justify-center rounded-sm border text-xs font-bold ${lookById(channel.look).bug}`}>
                        {channel.callsign}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block line-clamp-2 font-heading text-sm font-bold uppercase text-white">{program.title}</span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {program.durationGuess ? 'About ' : ''}
                        {lengthLabel(program.durationSec)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
