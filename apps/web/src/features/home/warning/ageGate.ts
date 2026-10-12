// Single definition shared by the module script (AgeGateScript.astro) and the pre-paint inline
// script in HomePage.astro (passed through define:vars), so the two decisions cannot drift apart.
export const CONFIRMED_AGE_KEY = 'hasConfirmedAge'
export const AGE_CONFIRM_DURATION = 30 * 24 * 60 * 60 * 1000
export const LIGHTHOUSE_USER_AGENT_TOKEN = 'lighthouse'

interface AgeGateDecisionInput {
  userAgent: string
  /** Raw `localStorage[CONFIRMED_AGE_KEY]` value. */
  storedValue: string | null
  now: number
}

export function hasValidAgeConfirmation({ userAgent, storedValue, now }: AgeGateDecisionInput): boolean {
  if (userAgent.toLowerCase().includes(LIGHTHOUSE_USER_AGENT_TOKEN))
    return true
  const timestamp = Number(storedValue)
  return Boolean(timestamp && now - timestamp < AGE_CONFIRM_DURATION)
}

// Reading `window.localStorage` itself throws when storage is blocked, hence the accessor.
/** `undefined` = storage unreadable (gate must stay closed); `null` = nothing stored (gate opens). */
export function readStoredAgeConfirmation(storage: () => Storage): string | null | undefined {
  try {
    return storage().getItem(CONFIRMED_AGE_KEY)
  }
  catch {
    return undefined
  }
}

export function writeStoredAgeConfirmation(storage: () => Storage, value: string): void {
  try {
    storage().setItem(CONFIRMED_AGE_KEY, value)
  }
  catch {}
}
