import process from 'node:process'

/**
 * Dev re-reads on every call so edits to `generated/*` show up without a restart; builds read once. The mode is
 * sampled when the getter is created (module load), like the per-module flags this replaces.
 */
export function cachedOutsideDev<T>(load: () => T): () => T {
  if (process.env.NODE_ENV === 'development')
    return load

  let cached: { value: T } | null = null
  return () => {
    cached ??= {
      value: load(),
    }
    return cached.value
  }
}
