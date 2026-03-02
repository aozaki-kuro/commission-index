import { CharacterRecord, characterRecords, getCharacterRecords } from './commissionRecords'

const isDevelopment = process.env.NODE_ENV === 'development'

interface CharacterProps {
  DisplayName: string
}

interface CommissionStatus {
  active: CharacterProps[]
  stale: CharacterProps[]
}

// 将角色记录划分为 active/stale 状态供前端消费
const buildStatus = (records: CharacterRecord[]): CommissionStatus => {
  const active: CharacterProps[] = []
  const stale: CharacterProps[] = []

  records.forEach(record => {
    const entry = { DisplayName: record.name }
    if (record.status === 'active') active.push(entry)
    else stale.push(entry)
  })

  return { active, stale }
}

const staticCharacterStatus: CommissionStatus = buildStatus(characterRecords)

export const getCharacterStatus = (): CommissionStatus =>
  isDevelopment ? buildStatus(getCharacterRecords()) : staticCharacterStatus

export const characterStatus: CommissionStatus = staticCharacterStatus
