// Single definition shared by the module script (AgeGateScript.astro) and the pre-paint inline
// script in HomePage.astro (passed through define:vars), so the two decisions cannot drift apart.
export const CONFIRMED_AGE_KEY = 'hasConfirmedAge'
// `window` property set when a confirmation could not be persisted. `window` survives ClientRouter soft
// navigations (language switches) and resets on a full load, which is the lifetime we want.
export const CONFIRMED_IN_MEMORY_FLAG = '__ageConfirmedInMemory'
export const AGE_CONFIRM_DURATION = 30 * 24 * 60 * 60 * 1000
export const LIGHTHOUSE_USER_AGENT_TOKEN = 'lighthouse'

interface AgeGateDecisionInput {
  userAgent: string
  /** Raw `localStorage[CONFIRMED_AGE_KEY]` value; `undefined` when storage is unreadable. */
  storedValue: string | null | undefined
  now: number
  /** True once the user confirmed in this document but storage could not persist it. */
  confirmedInMemory?: boolean
}

// Unreadable storage (`undefined`) fails closed: the gate shows unless confirmed in memory. The pre-paint
// script in HomePage.astro cannot import this, so keep its logic equivalent.
export function hasValidAgeConfirmation({ userAgent, storedValue, now, confirmedInMemory = false }: AgeGateDecisionInput): boolean {
  if (confirmedInMemory || userAgent.toLowerCase().includes(LIGHTHOUSE_USER_AGENT_TOKEN))
    return true
  const timestamp = Number(storedValue)
  return Boolean(timestamp && now - timestamp < AGE_CONFIRM_DURATION)
}

// Reading `window.localStorage` itself throws when storage is blocked, hence the accessor.
/** `undefined` = storage unreadable; `null` = nothing stored. Both open the gate unless confirmed in memory. */
export function readStoredAgeConfirmation(storage: () => Storage): string | null | undefined {
  try {
    return storage().getItem(CONFIRMED_AGE_KEY)
  }
  catch {
    return undefined
  }
}

/** Returns false when the value could not be persisted. */
export function writeStoredAgeConfirmation(storage: () => Storage, value: string): boolean {
  try {
    storage().setItem(CONFIRMED_AGE_KEY, value)
    return true
  }
  catch {
    return false
  }
}
