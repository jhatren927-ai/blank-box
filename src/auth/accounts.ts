import type { Network } from '../types.ts'

/**
 * Passwordless email-code accounts.
 *
 * TODO: connect this to Supabase Auth (`signInWithOtp` + `verifyOtp`) and
 * store one network row per user. The MVP does not create accounts.
 * localStorage (see src/lib/storage.ts) is the only store, and the sync code
 * in src/lib/sync.ts is how a lineup moves to another device.
 */
export interface AccountSession {
  userId: string
  email: string
}

export interface AccountClient {
  readonly enabled: false
  requestEmailCode(email: string): Promise<void>
  verifyEmailCode(email: string, code: string): Promise<AccountSession>
  pullNetwork(session: AccountSession): Promise<Network | null>
  pushNetwork(session: AccountSession, network: Network): Promise<void>
}

export const accounts: AccountClient = {
  enabled: false,
  requestEmailCode() {
    return Promise.reject(new Error('Email sign-in is not set up yet.'))
  },
  verifyEmailCode() {
    return Promise.reject(new Error('Email sign-in is not set up yet.'))
  },
  pullNetwork() {
    return Promise.reject(new Error('Email sign-in is not set up yet.'))
  },
  pushNetwork() {
    return Promise.reject(new Error('Email sign-in is not set up yet.'))
  },
}
