import type { Props } from '@data/types'
import type { CharacterRecord } from './commissionRecords'
import { filterHiddenCommissions, sortCommissionsByDate } from '@lib/commissions'
import { buildCommissionDataMap } from '@lib/sitePayload'
import { cachedOutsideDev } from './cachedOutsideDev'
import { getCharacterRecords } from './commissionRecords'

// 将角色记录转换为页面消费的数据结构，并按时间倒序
export function buildCommissionData(records: CharacterRecord[]): Props {
  return filterHiddenCommissions(
    records.map(record => ({
      Character: record.name,
      Commissions: record.commissions.toSorted(sortCommissionsByDate),
    })),
  )
}

export const getCommissionData: () => Props = cachedOutsideDev(() => buildCommissionData(getCharacterRecords()))

export const getCommissionDataMap = cachedOutsideDev(() => buildCommissionDataMap(getCommissionData()))
