import type { Props } from '@data/types'
import type { CharacterRecord } from './commissionRecords'
import process from 'node:process'
import { filterHiddenCommissions, sortCommissionsByDate } from '@lib/commissions'
import { buildCommissionDataMap } from '@lib/sitePayload'
import { characterRecords, getCharacterRecords } from './commissionRecords'

const isDevelopment = process.env.NODE_ENV === 'development'

// 将角色记录转换为页面消费的数据结构，并按时间倒序
export function buildCommissionData(records: CharacterRecord[]): Props {
  return filterHiddenCommissions(
    records.map(record => ({
      Character: record.name,
      Commissions: record.commissions.toSorted(sortCommissionsByDate),
    })),
  )
}

const staticCommissionData: Props = buildCommissionData(characterRecords)
const staticCommissionDataMap = buildCommissionDataMap(staticCommissionData)

export function getCommissionData(): Props {
  return isDevelopment
    ? buildCommissionData(getCharacterRecords())
    : staticCommissionData
}

// 开发态每次重建映射，生产态复用缓存
export function getCommissionDataMap() {
  return isDevelopment
    ? buildCommissionDataMap(getCommissionData())
    : staticCommissionDataMap
}
