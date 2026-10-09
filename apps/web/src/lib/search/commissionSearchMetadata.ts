// Thin web shim over the domain implementation — kept so web-internal imports stay stable.
// The public site omits `fileName` (its identity is `publicId`); admin passes it for the legacy-key search term.
export { buildCommissionSearchDomKey, buildCommissionSearchMetadata } from '@commission-index/domain'
