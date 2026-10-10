import { createHash } from 'node:crypto'

/**
 * Truncated SHA-256 (first 12 hex chars) of the serialized value. Names immutable
 * content-addressed files, so it must be collision-resistant across payload revisions —
 * djb2's 32-bit space is not. Node/build-time only; never import from browser code.
 */
export function contentHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12)
}
