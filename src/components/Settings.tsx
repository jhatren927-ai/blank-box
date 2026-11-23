import { useEffect, useRef, useState } from 'react'
import { toDataURL } from 'qrcode'
import { accounts } from '../auth/accounts.ts'
import { cloudShareUrl, getCloudKeyFromInput, loadCloudNetwork, saveCloudNetwork } from '../lib/cloudSave.ts'
import { isPin } from '../lib/pin.ts'
import { decodeNetwork, encodeNetwork } from '../lib/sync.ts'
import type { Network } from '../types.ts'
import { Button } from './ui/button.tsx'
import { Modal } from './ui/dialog.tsx'

export function Settings({
  network,
  onPin,
  onImport,
  onReset,
}: {
  network: Network
  onPin: (pin: string | null) => Promise<void>
  onImport: (network: Network) => void
  onReset: () => void
}) {
  const [code, setCode] = useState('')
  const [qr, setQr] = useState<string | null>(null)
  const [qrNote, setQrNote] = useState<string | null>(null)
  const [incoming, setIncoming] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [importNote, setImportNote] = useState<string | null>(null)
  const [importBusy, setImportBusy] = useState(false)
  const [pin, setPin] = useState('')
  const [pinAgain, setPinAgain] = useState('')
  const [resetOpen, setResetOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [cloudLink, setCloudLink] = useState('')
  const [cloudQr, setCloudQr] = useState<string | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudNote, setCloudNote] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let cancel = false
    void encodeNetwork(network).then(async (next) => {
      if (cancel) return
      setCode(next)
      if (next.length > 2200) {
        setQr(null)
        setQrNote('This lineup is too big for a camera code. Copy the sync code and paste it on the other TV.')
        return
      }
      try {
        const url = await toDataURL(next, { errorCorrectionLevel: 'L', margin: 1, width: 280 })
        if (!cancel) {
          setQr(url)
          setQrNote(null)
        }
      } catch {
        if (!cancel) setQrNote('The camera code could not be drawn. Copy the sync code instead.')
      }
    })
    return () => {
      cancel = true
    }
  }, [network])

  useEffect(() => {
    if (!scanning) return
    const Detector = (window as unknown as {
      BarcodeDetector?: new (options: { formats: string[] }) => {
        detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>
      }
    }).BarcodeDetector
    if (!Detector) {
      setImportNote('This browser cannot read a camera code. Paste the code instead.')
      setScanning(false)
      return
    }
    let stop = false
    let stream: MediaStream | null = null
    const detector = new Detector({ formats: ['qr_code'] })
    void navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((next) => {
        stream = next
        if (videoRef.current) {
          videoRef.current.srcObject = next
          void videoRef.current.play()
        }
        const tick = () => {
          if (stop || !videoRef.current) return
          void detector.detect(videoRef.current).then((codes) => {
            const value = codes[0]?.rawValue
            if (value) {
              setIncoming(value)
              setScanning(false)
              setImportNote('Code found. Tap Load it.')
              return
            }
            if (!stop) requestAnimationFrame(tick)
          }).catch(() => {
            if (!stop) requestAnimationFrame(tick)
          })
        }
        requestAnimationFrame(tick)
      })
      .catch(() => {
        setImportNote('The camera did not open. Paste the code instead.')
        setScanning(false)
      })
    return () => {
      stop = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [scanning])

  async function applyImport() {
    if (importBusy) return
    setImportBusy(true)
    setImportNote('Loading lineup…')
    try {
      const cloudKey = getCloudKeyFromInput(incoming)
      if (cloudKey) {
        const next = await loadCloudNetwork(cloudKey)
        setImportNote(`Loaded ${next.name} (${next.channels.length} channels).`)
        onImport(next)
        return
      }
      const next = await decodeNetwork(incoming)
      setImportNote(`Loaded ${next.name}.`)
      onImport(next)
    } catch (error) {
      setImportNote(error instanceof Error ? error.message : 'That code did not work. Try copying it again.')
    } finally {
      setImportBusy(false)
    }
  }

  async function saveOnline() {
    setCloudBusy(true)
    setCloudNote('Saving lineup online…')
    try {
      const key = await saveCloudNetwork(network)
      const link = cloudShareUrl(key)
      setCloudLink(link)
      setCloudNote('✓ Saved online. Your private restore link is ready below.')
      try {
        setCloudQr(await toDataURL(link, { errorCorrectionLevel: 'M', margin: 1, width: 280 }))
      } catch {
        setCloudNote('✓ Saved online. Your private restore link is ready below. QR code unavailable; copy the link instead.')
      }
    } catch (error) {
      setCloudNote(error instanceof Error ? error.message : 'Could not save online. Please try again.')
    } finally {
      setCloudBusy(false)
    }
  }

  async function savePin() {
    if (!isPin(pin) || pin !== pinAgain) {
      setNote('Type the same 4 digits twice.')
      return
    }
    await onPin(pin)
    setPin('')
    setPinAgain('')
    setNote('Lock is on.')
  }

  return (
    <section className="mx-auto max-w-3xl space-y-4 px-3 py-4">
      <h2 className="font-heading text-3xl font-black uppercase text-white">Settings</h2>
      <p className="font-mono text-sm text-slate-400">The name at the top is your network. Tap it any time to change it.</p>

      <div className="rounded-md border border-[#1e293b] bg-[#101624] p-4">
        <h3 className="font-heading text-xl font-bold uppercase text-prevue-yellow">Take it to another TV</h3>
        <p className="mt-1 font-mono text-sm text-slate-400">Copy this code, or scan it if it fits. Nothing is sent to a server.</p>
        <textarea data-testid="sync-export" readOnly value={code} className="mt-3 h-28 w-full rounded-sm bg-black/50 p-2 font-mono text-xs text-slate-200" />
        <Button
          variant="navy"
          className="mt-2"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(
              () => setNote('Copied.'),
              () => setNote('Select the code and copy it.'),
            )
          }}
        >
          Copy code
        </Button>
        {qr && <img src={qr} alt="Sync code" className="mt-4 h-56 w-56 bg-white p-2" />}
        {qrNote && <p className="mt-2 font-mono text-sm text-blue-100">{qrNote}</p>}
      </div>

      <div className="rounded-md border border-[#1e293b] bg-[#101624] p-4">
        <h3 className="font-heading text-xl font-bold uppercase text-prevue-yellow">Save this lineup online</h3>
        <p className="mt-1 font-mono text-sm text-slate-400">Keep a cloud copy and open it on another TV, phone, or computer. No account or sign-in needed. Anyone with your private link can open the lineup, so keep it safe.</p>
        <Button
          type="button"
          data-testid="cloud-save"
          className="mt-3 min-h-12"
          onPointerDown={() => setCloudNote('Starting online save…')}
          onClick={() => void saveOnline()}
          disabled={cloudBusy}
        >
          {cloudBusy ? 'Saving…' : cloudLink ? 'Update saved lineup' : 'Save lineup online'}
        </Button>
        <p
          data-testid="cloud-save-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-3 min-h-12 rounded-sm border border-prevue-yellow/40 bg-black/40 p-3 font-mono text-sm text-yellow-100"
        >
          {cloudNote ?? 'Tap “Save lineup online” to create a private restore link.'}
        </p>
        {cloudLink && (
          <>
            <label className="mt-3 block font-mono text-xs text-slate-400">Your private restore link</label>
            <textarea readOnly value={cloudLink} className="mt-1 h-16 w-full rounded-sm bg-black/50 p-2 font-mono text-xs text-slate-200" />
            <Button variant="navy" className="mt-2" onClick={() => void navigator.clipboard.writeText(cloudLink).then(() => setNote('Restore link copied.'), () => setNote('Select the link and copy it.'))}>Copy restore link</Button>
            {cloudQr && <img src={cloudQr} alt="Private cloud restore QR code" className="mt-4 h-56 w-56 bg-white p-2" />}
          </>
        )}
      </div>

      <div className="rounded-md border border-[#1e293b] bg-[#101624] p-4">
        <h3 className="font-heading text-xl font-bold uppercase text-prevue-yellow">Load a lineup</h3>
        <textarea
          data-testid="sync-import"
          value={incoming}
          onChange={(event) => { setIncoming(event.target.value); setImportNote(null) }}
          placeholder="Paste a sync code or cloud restore link"
          className="mt-3 h-28 w-full rounded-sm bg-black/50 p-2 font-mono text-xs text-white outline-none focus:ring-1 focus:ring-yellow-300"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button data-testid="sync-apply" onClick={() => void applyImport()} disabled={!incoming.trim() || importBusy}>
            {importBusy ? 'Loading…' : 'Load it'}
          </Button>
          <Button variant="chassis" onClick={() => setScanning((value) => !value)}>
            {scanning ? 'Stop camera' : 'Scan a code'}
          </Button>
        </div>
        <p data-testid="sync-import-status" role="status" aria-live="polite" aria-atomic="true" className="mt-3 min-h-12 rounded-sm border border-prevue-yellow/40 bg-black/40 p-3 font-mono text-sm text-yellow-100">{importNote ?? 'Enter the six-digit code, then select Load it. Results and errors will appear here.'}</p>
        {scanning && <video ref={videoRef} className="mt-3 aspect-video w-full max-w-sm bg-black" muted playsInline />}
      </div>

      <div className="rounded-md border border-[#1e293b] bg-[#101624] p-4">
        <h3 className="font-heading text-xl font-bold uppercase text-prevue-yellow">Lock</h3>
        <p className="mt-1 font-mono text-sm text-slate-400">A 4-digit lock stops a tap. It is not a real password.</p>
        {network.pin ? (
          <Button className="mt-3" variant="danger" onClick={() => void onPin(null)}>
            Turn the lock off
          </Button>
        ) : (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="4 digits"
              className="h-12 w-full rounded-sm bg-black/50 px-3 font-mono text-lg text-white"
            />
            <input
              inputMode="numeric"
              maxLength={4}
              value={pinAgain}
              onChange={(event) => setPinAgain(event.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="Again"
              className="h-12 w-full rounded-sm bg-black/50 px-3 font-mono text-lg text-white"
            />
            <Button onClick={() => void savePin()}>Save lock</Button>
          </div>
        )}
      </div>

      <div className="rounded-md border border-[#1e293b] bg-[#101624] p-4">
        <h3 className="font-heading text-xl font-bold uppercase text-prevue-yellow">Start over</h3>
        <p className="mt-1 font-mono text-sm text-slate-400">Erases every channel on this device.</p>
        <Button data-testid="reset-network" className="mt-3" variant="danger" onClick={() => setResetOpen(true)}>
          Erase the lineup
        </Button>
      </div>

      <div className="rounded-md border border-[#1e293b] bg-[#101624] p-4 font-mono text-sm text-slate-300">
        <p>Blank Box plays videos from the places you pick. Archive.org starts on free movies. YouTube keeps its own ads. Wikimedia, NASA, Vimeo, and Dailymotion use their public pages.</p>
        <p className="mt-2">
          {accounts.enabled
            ? 'Signed in.'
            : 'Saving with email is not on yet. Your lineup stays on this device until you save it online or copy the sync code.'}
        </p>
      </div>
      {note && <p className="font-mono text-sm text-yellow-200">{note}</p>}
      <Modal open={resetOpen} onOpenChange={setResetOpen} title="Erase all channels?">
        <div className="flex flex-col gap-3">
          <Button data-testid="reset-confirm" variant="danger" onClick={onReset}>
            Erase
          </Button>
          <Button variant="chassis" onClick={() => setResetOpen(false)}>
            Keep them
          </Button>
        </div>
      </Modal>
    </section>
  )
}
