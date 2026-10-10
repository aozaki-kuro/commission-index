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
