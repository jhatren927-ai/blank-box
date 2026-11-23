import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

const API = 'https://blank-box-save.blankbox-tv.workers.dev'
const TOKEN_KEY = 'blankbox-license-session'

type User = { email: string; role: 'owner' | 'admin' | 'user' }
type License = { id: string; email: string; role: string; label: string | null; revoked: number; created_at: string }

async function request(path: string, token?: string, init: RequestInit = {}) {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  const data = await response.json().catch(() => ({})) as Record<string, any>
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`)
  return data
}

export function LicenseGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)

  useEffect(() => {
    let live = true
    if (!token) { setChecking(false); return }
    request('/api/auth/me', token).then((data) => {
      if (live) setUser(data.user as User)
    }).catch(() => {
      localStorage.removeItem(TOKEN_KEY)
      if (live) { setToken(''); setUser(null) }
    }).finally(() => { if (live) setChecking(false) })
    return () => { live = false }
  }, [token])

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const data = await request('/api/auth/login', undefined, {
        method: 'POST', body: JSON.stringify({ email: email.trim(), code: code.trim() }),
      })
      localStorage.setItem(TOKEN_KEY, data.token as string)
      setUser(data.user as User)
      setToken(data.token as string)
    } catch (err) { setError(err instanceof Error ? err.message : 'Sign-in failed.') }
    finally { setBusy(false); setChecking(false) }
  }

  async function signOut() {
    try { await request('/api/auth/logout', token, { method: 'POST', body: '{}' }) } catch { /* local sign-out still works */ }
    localStorage.removeItem(TOKEN_KEY); setToken(''); setUser(null); setAdminOpen(false)
  }

  if (checking) return <GateFrame><p className="text-slate-300">Checking your license…</p></GateFrame>
  if (!user) return <GateFrame>
    <div className="mb-7 text-center">
      <p className="font-heading text-xs font-black tracking-[0.3em] text-yellow-300">BLANK BOX TV</p>
      <h1 className="mt-3 text-3xl font-black text-white">Private access</h1>
      <p className="mt-2 text-sm text-slate-400">Enter your email address and six-digit passcode.</p>
    </div>
    <form onSubmit={signIn} className="space-y-4">
      <label className="block text-sm font-semibold text-slate-300">Email address
        <input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-yellow-300" />
      </label>
      <label className="block text-sm font-semibold text-slate-300">Six-digit passcode
        <input type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-yellow-300" />
      </label>
      {error && <p role="alert" className="rounded-lg bg-red-950/60 p-3 text-sm text-red-200">{error}</p>}
      <button disabled={busy} className="w-full rounded-xl bg-yellow-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-60">{busy ? 'Checking…' : 'Sign in'}</button>
    </form>
    <p className="mt-5 text-center text-xs text-slate-500">Access is invitation-only. Contact the Blank Box TV owner for a license.</p>
  </GateFrame>

  return <>{user.role === 'owner' || user.role === 'admin' ? (
    <div className="fixed right-3 top-3 z-[100] flex gap-2">
      <button onClick={() => setAdminOpen(v => !v)} className="rounded-full border border-yellow-300/40 bg-slate-950/95 px-3 py-2 text-xs font-bold text-yellow-200 shadow-lg">{adminOpen ? 'Close admin' : 'Admin'}</button>
      <button onClick={signOut} className="rounded-full border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-lg">Sign out</button>
    </div>
  ) : <button onClick={signOut} className="fixed right-3 top-3 z-[100] rounded-full border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs text-slate-200">Sign out</button>}
  {adminOpen ? <AdminPanel token={token} onClose={() => setAdminOpen(false)} /> : children}</>
}

function GateFrame({ children }: { children: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#090e19] px-4 py-10 text-slate-100"><section className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#111a2b] p-6 shadow-2xl sm:p-8">{children}</section></main>
}

function AdminPanel({ token, onClose }: { token: string; onClose: () => void }) {
  const [licenses, setLicenses] = useState<License[]>([])
  const [email, setEmail] = useState('')
  const [label, setLabel] = useState('')
  const [newCode, setNewCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function refresh() {
    try { const data = await request('/api/admin/licenses', token); setLicenses(data.licenses as License[]) }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load licenses.') }
  }
  useEffect(() => { void refresh() }, [token])

  async function issue(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setNewCode('')
    try {
      const data = await request('/api/admin/licenses', token, { method: 'POST', body: JSON.stringify({ email, label }) })
      setNewCode(data.code as string); setEmail(''); setLabel(''); await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not issue license.') }
    finally { setBusy(false) }
  }
  async function toggleLicense(item: License) {
    try { await request(`/api/admin/licenses/${item.id}/${item.revoked ? 'restore' : 'revoke'}`, token, { method: 'POST', body: '{}' }); await refresh() }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not update license.') }
  }

  return <div className="fixed inset-0 z-[110] overflow-y-auto bg-[#090e19] p-4 text-slate-100 sm:p-8">
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-[0.25em] text-yellow-300">BLANK BOX TV</p><h1 className="mt-1 text-2xl font-black">License administration</h1></div><button onClick={onClose} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">Back to app</button></div>
      <form onSubmit={issue} className="mt-6 space-y-3 rounded-xl border border-slate-700 bg-[#111a2b] p-4">
        <h2 className="font-bold">Issue a license</h2>
        <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="Recipient email" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Optional label (e.g. family room)" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-white" />
        <button disabled={busy} className="rounded-lg bg-yellow-300 px-4 py-3 font-bold text-slate-950 disabled:opacity-60">{busy ? 'Creating…' : 'Create license'}</button>
        {newCode && <div className="rounded-lg border border-emerald-700 bg-emerald-950/50 p-3"><p className="text-sm font-bold text-emerald-200">New six-digit passcode created — copy it now.</p><code className="mt-2 block break-all text-sm text-white">{newCode}</code><button type="button" onClick={() => navigator.clipboard?.writeText(newCode)} className="mt-2 text-xs underline">Copy code</button></div>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      </form>
      <section className="mt-6 rounded-xl border border-slate-700 bg-[#111a2b] p-4"><div className="flex items-center justify-between"><h2 className="font-bold">Issued licenses</h2><button onClick={() => void refresh()} className="text-xs underline">Refresh</button></div>
        <div className="mt-3 divide-y divide-slate-700">{licenses.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="break-all text-sm font-semibold">{item.email}</p><p className="text-xs text-slate-400">{item.role} · {item.label || 'No label'} · {item.revoked ? 'Revoked' : 'Active'}</p></div>{item.role !== 'owner' && <button onClick={() => void toggleLicense(item)} className="shrink-0 rounded-lg border border-slate-600 px-3 py-2 text-xs">{item.revoked ? 'Restore' : 'Revoke'}</button>}</div>)}</div>
      </section>
    </div>
  </div>
}
