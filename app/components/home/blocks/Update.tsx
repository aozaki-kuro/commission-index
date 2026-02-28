import { getBaseFileName, kebabCase } from '#lib/utils/strings'
import { isCharacterActive } from '#lib/characters/status'
import {
  collectUniqueCommissions,
  flattenCommissions,
  parseCommissionFileName,
} from '#lib/commissions/index'
import { parseAndFormatDate } from '#lib/date/format'
import { getCommissionData } from '#data/commissionData'
import HashLink from '#components/shared/HashLink'

const isMilestone = (num: number): boolean => num > 0 && num % 50 === 0

/**
 * Update 组件显示最新的委托作品更新信息。
 */
const Update = () => {
  const commissionData = getCommissionData()

  // 使用 Set 去重并计算唯一的委托总数。
  const totalCommissions = new Set(
    commissionData.flatMap(({ Commissions }) =>
      Commissions.map(({ fileName }) => getBaseFileName(fileName)),
    ),
  ).size

  // 获取活跃角色的最新委托作品列表。
  const latestEntries = flattenCommissions(commissionData, ({ Character }) =>
    isCharacterActive(Character),
  )

  // 使用 mergePartsAndPreviews 函数对委托作品进行去重处理，保留最新的版本。
  const uniqueEntries = collectUniqueCommissions(latestEntries)

  // 将委托作品按日期排序，并获取最近的三个条目。
  const sortedEntries = uniqueEntries.slice(0, 3)

  // 如果没有最新的委托作品，显示提示信息
  if (sortedEntries.length === 0) {
    return <p className="font-mono text-sm">No active updates found</p>
  }

  // 渲染最新的委托作品信息
  return (
    <div className="mt-6 mb-4 flex flex-col font-mono text-xs sm:text-sm md:mt-8">
      {/* 显示当前的委托总数，如果是里程碑数字则添加庆祝表情 */}
      <p className="mb-2">
        Currently {totalCommissions} commissions{isMilestone(totalCommissions) ? ' 🎉' : ''}
      </p>

      <div className="flex items-start">
        <p className="mr-2">Last update:</p>
        <div className="flex flex-col space-y-2">
          {/* 遍历最近的委托作品条目并渲染 */}
          {sortedEntries.map(({ fileName, character }) => {
            const { date } = parseCommissionFileName(fileName)
            const formattedDate = parseAndFormatDate(date, 'yyyy/MM/dd')
            const linkId = `#${kebabCase(character)}-${date}`

            return (
              <p key={fileName} className="mr-2">
                {/* 显示格式化日期并创建指向对应角色的链接 */}
                {formattedDate} {'[ '}
                <HashLink href={linkId} className="underline-offset-2">
                  {character}
                </HashLink>
                {' ]'}
              </p>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default Update
