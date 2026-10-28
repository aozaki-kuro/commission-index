import type { CharacterRecord } from './commissionRecords'
import process from 'node:process'
import { characterRecords, getCharacterRecords } from './commissionRecords'

const isDevelopment = process.env.NODE_ENV === 'development'

interface CharacterProps {
  DisplayName: string
}

export interface CommissionStatus {
  active: CharacterProps[]
  archived: CharacterProps[]
}

// 将角色记录划分为 active/archived 状态供前端消费
export function buildCharacterStatus(records: CharacterRecord[]): CommissionStatus {
  const active: CharacterProps[] = []
  const archived: CharacterProps[] = []

  records.forEach((record) => {
    const entry = { DisplayName: record.name }
    if (record.status === 'active')
      active.push(entry)
    else archived.push(entry)
  })

  return { active, archived }
}

const staticCharacterStatus: CommissionStatus = buildCharacterStatus(characterRecords)

export function getCharacterStatus(): CommissionStatus {
  return isDevelopment
    ? buildCharacterStatus(getCharacterRecords())
    : staticCharacterStatus
}

export const characterStatus: CommissionStatus = staticCharacterStatus
