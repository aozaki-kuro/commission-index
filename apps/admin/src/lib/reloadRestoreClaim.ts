// The document's navigation entry stays 'reload' for its whole life, so Edit's storage-based scroll restore must be
// limited to the first Edit mount that commits; later SPA visits belong to App's own restoration. The claim closes
// on commit, not on first read: StrictMode and a suspended render both run the state initializer more than once.
let claimed = false

export function isReloadRestoreAvailable() {
  return !claimed
}

export function claimReloadRestore() {
  claimed = true
}

export function resetReloadRestoreClaim() {
  claimed = false
}
