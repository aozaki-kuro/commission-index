import {
  hasDeferredHomeTimelineTarget,
  normalizeHomeTimelineTargetId,
  resolveHomeTimelineTargetBatch,
} from '#features/home/commission/homeTimelineBatchManifest'
import { templateContentContainsElementId } from '#features/home/commission/templateContentLookup'
import { readHomeTimelineBatchManifest } from './homeTimelineBatchManifest'

export const TIMELINE_VIEW_LOAD_REQUEST_EVENT = 'home:timeline-load-request'

const TIMELINE_PANEL_SELECTOR = '[data-commission-view-panel="timeline"]'
const TIMELINE_BATCH_TEMPLATE_SELECTOR = 'template[data-timeline-batch-index]'
const LEGACY_TIMELINE_TEMPLATE_SELECTOR = 'template[data-timeline-sections-template="true"]'

export interface RequestTimelineViewLoadOptions {
  strategy?: 'next' | 'all' | 'target'
  targetId?: string
  targetBatchCount?: number
}

function getLegacyTimelineBatchTotalCount(doc: Document) {
  return doc.querySelector<HTMLTemplateElement>(LEGACY_TIMELINE_TEMPLATE_SELECTOR) ? 1 : 0
}

function hasConnectedElementById(doc: Document, id: string) {
  const element = doc.getElementById(id)
  return Boolean(element?.isConnected)
}

function getBatchTemplateIndex(template: HTMLTemplateElement) {
  const value = Number(template.dataset.timelineBatchIndex ?? '')
  if (!Number.isFinite(value) || value < 0)
    return null
  return Math.floor(value)
}

function getBatchTemplates(doc: Document) {
  return [...doc.querySelectorAll<HTMLTemplateElement>(TIMELINE_BATCH_TEMPLATE_SELECTOR)]
}

export function getHomeTimelineBatchTotalCount(doc?: Document) {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return 0

  const manifest = readHomeTimelineBatchManifest(resolvedDocument)
  if (Number.isInteger(manifest?.totalBatches)) {
    return Number(manifest?.totalBatches ?? 0)
  }

  const batchTemplates = getBatchTemplates(resolvedDocument)
  if (batchTemplates.length > 0)
    return batchTemplates.length

  return getLegacyTimelineBatchTotalCount(resolvedDocument)
}

export function readTimelineLoadedState(doc?: Document) {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return true

  const panel = resolvedDocument.querySelector<HTMLElement>(TIMELINE_PANEL_SELECTOR)
  return panel?.dataset.timelineLoaded === 'true'
}

export function readTimelineLoadedBatchCount(doc?: Document) {
  const resolvedDocument = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!resolvedDocument)
    return 0

  const panel = resolvedDocument.querySelector<HTMLElement>(TIMELINE_PANEL_SELECTOR)
  const value = Number(panel?.dataset.timelineBatchesLoadedCount ?? '0')
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function writeTimelineLoadedBatchCount(panel: HTMLElement, count: number) {
  panel.dataset.timelineBatchesLoadedCount = String(Math.max(0, Math.floor(count)))
}

export function writeTimelineLoadedState(panel: HTMLElement, loaded: boolean) {
  panel.dataset.timelineLoaded = loaded ? 'true' : 'false'
}

export function hasDeferredTimelineTarget(doc: Document, rawTargetId: string | null | undefined) {
  if (hasDeferredHomeTimelineTarget({ doc, rawTargetId })) {
    return true
  }

  const targetId = normalizeHomeTimelineTargetId(rawTargetId)
  if (!targetId || hasConnectedElementById(doc, targetId))
    return false

  for (const template of getBatchTemplates(doc)) {
    if (!templateContentContainsElementId(template.content, targetId))
      continue
    return true
  }

  const legacyTemplate = doc.querySelector<HTMLTemplateElement>(LEGACY_TIMELINE_TEMPLATE_SELECTOR)
  return legacyTemplate ? templateContentContainsElementId(legacyTemplate.content, targetId) : false
}

export function resolveDeferredTimelineBatch(doc: Document, rawTargetId: string | null | undefined) {
  const batchIndex = resolveHomeTimelineTargetBatch({ doc, rawTargetId })
  if (batchIndex !== null)
    return batchIndex

  const targetId = normalizeHomeTimelineTargetId(rawTargetId)
  if (!targetId || hasConnectedElementById(doc, targetId))
    return null

  for (const template of getBatchTemplates(doc)) {
    if (!templateContentContainsElementId(template.content, targetId))
      continue
    const templateIndex = getBatchTemplateIndex(template)
    if (templateIndex !== null)
      return templateIndex
  }

  const legacyTemplate = doc.querySelector<HTMLTemplateElement>(LEGACY_TIMELINE_TEMPLATE_SELECTOR)
  return legacyTemplate && templateContentContainsElementId(legacyTemplate.content, targetId) ? 0 : null
}

export function requestTimelineViewLoad(win: Window, options: RequestTimelineViewLoadOptions = {}) {
  win.dispatchEvent(
    new CustomEvent<RequestTimelineViewLoadOptions>(TIMELINE_VIEW_LOAD_REQUEST_EVENT, {
      detail: options,
    }),
  )
}
