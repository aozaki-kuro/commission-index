import { filterHiddenCommissions, sortCommissionsByDate } from '#lib/commissions'
import { Props } from '#data/types'
import { CharacterRecord, characterRecords, getCharacterRecords } from './commissionRecords'

const isDevelopment = process.env.NODE_ENV === 'development'

// 将角色记录转换为页面消费的数据结构，并按时间倒序
export const buildCommissionData = (records: CharacterRecord[]): Props =>
  filterHiddenCommissions(
    records.map(record => ({
      Character: record.name,
      Commissions: [...record.commissions].sort(sortCommissionsByDate),
    })),
  )

const buildCommissionMap = (data: Props) =>
  new Map(data.map(character => [character.Character, character]))

const staticCommissionData: Props = buildCommissionData(characterRecords)
const staticCommissionDataMap = buildCommissionMap(staticCommissionData)

export const getCommissionData = (): Props =>
  isDevelopment ? buildCommissionData(getCharacterRecords()) : staticCommissionData

// 开发态每次重建映射，生产态复用缓存
export const getCommissionDataMap = () =>
  isDevelopment ? buildCommissionMap(getCommissionData()) : staticCommissionDataMap

export const commissionData: Props = staticCommissionData
export const commissionDataMap = staticCommissionDataMap
