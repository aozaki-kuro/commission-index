/** Lowercase UUID v4 only: the shape the admin worker accepts for a work-group id. */
export const UUID_V4_PATTERN = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/

/** Lowercase RFC 4122 variant, versions 1-8: the shape the web accepts for exported public/work-group ids. */
export const CANONICAL_UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/

export function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value)
}
