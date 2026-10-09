/**
 * Shape of the public `/build-info.json` emitted by apps/web at build time.
 * `dataExportedAt` is the D1 snapshot time (stamped before the read, excluded from `dataRevision`);
 * the admin uses it to decide whether a rebuild has picked up saves made before its dispatch.
 */
export interface BuildInfo {
  dataRevision: string
  dataExportedAt: string
  codeSha: string | null
  builtAt: string
}
