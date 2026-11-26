import type { Program } from '../types.ts'
import { archiveAdapter } from '../sources/archive.ts'
import { dailymotionAdapter } from '../sources/dailymotion.ts'
import { directAdapter } from '../sources/direct.ts'
import { vimeoAdapter } from '../sources/vimeo.ts'
import { youtubeAdapter } from '../sources/youtube.ts'
import type { SourceAdapter } from '../sources/types.ts'

function pickAdapter(line: string): SourceAdapter {
  if (/youtu\.?be|youtube\.com/i.test(line)) return youtubeAdapter
  if (/vimeo\.com/i.test(line)) return vimeoAdapter
  if (/dailymotion\.com|dai\.ly/i.test(line)) return dailymotionAdapter
  if (/archive\.org\/details\//i.test(line)) return archiveAdapter
  return directAdapter
}

export async function programsFromLines(text: string): Promise<Program[]> {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const programs: Program[] = []
  for (const line of lines) {
    const adapter = pickAdapter(line)
    if (!adapter.fromPaste) continue
    try {
      programs.push(...(await adapter.fromPaste(line)))
    } catch {
      /* that line did not resolve */
    }
  }
  return programs
}
