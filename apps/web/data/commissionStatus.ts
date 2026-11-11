import type { CharacterRecord } from './commissionRecords'

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
