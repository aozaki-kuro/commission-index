import type { CharacterRecord } from '@commission-index/domain'
import process from 'node:process'
import { getGeneratedFactSourceContent } from './generatedFactSource'

const isDevelopment = process.env.NODE_ENV === 'development'

function cloneCharacterRecords(records: CharacterRecord[]): CharacterRecord[] {
  return records
    .map(record => ({
      ...record,
      commissions: record.commissions.map(commission => ({
        ...commission,
        Links: [...commission.Links],
      })),
    }))
    .toSorted((a, b) => a.sortOrder - b.sortOrder)
}

function loadCharacterRecords(): CharacterRecord[] {
  return cloneCharacterRecords(getGeneratedFactSourceContent().characters)
}

const staticCharacterRecords = loadCharacterRecords()

export function getCharacterRecords(): CharacterRecord[] {
  return isDevelopment
    ? loadCharacterRecords()
    : staticCharacterRecords
}

export { staticCharacterRecords as characterRecords }
export type { CharacterRecord, CharacterStatus } from '@commission-index/domain'
