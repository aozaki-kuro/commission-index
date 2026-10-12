/**
 * Shape of the public `/build-info.json` emitted by apps/web at build time.
 * `dataExportedAt` is the D1 snapshot time (stamped before the read, excluded from `dataRevision`);
 * the admin uses it to decide whether a rebuild has picked up saves made before its dispatch.
 * `codeSha` is kept only for wire compatibility (the admin parser requires the key) and is always
 * `null`: the repo is public, and GitHub commit search resolves a SHA to it.
 */
export interface BuildInfo {
  dataRevision: string
  dataExportedAt: string
  codeSha: string | null
  builtAt: string
}

export interface BuildMeta {
  revision: string
  exportedAt: string
}

export function createPublicBuildInfo(meta: BuildMeta, builtAt: string): BuildInfo {
  return {
    dataRevision: meta.revision,
    dataExportedAt: meta.exportedAt,
    codeSha: null,
    builtAt,
  }
}

/** Short data-revision prefix plus export date (UTC day of an ISO timestamp). */
export function formatBuildLabel(meta: BuildMeta): string {
  return `${meta.revision.slice(0, 7)} · ${meta.exportedAt.slice(0, 10)}`
}
