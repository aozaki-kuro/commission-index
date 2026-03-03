import type { Props } from '#data/types'
import {
  buildHomeUpdateSummary,
  isMilestoneCommissionCount,
  type HomeUpdateSummary,
} from '#lib/home/updateSummary'
import HashLink from '#components/shared/HashLink'

/**
 * Update 组件显示最新的委托作品更新信息。
 */
interface UpdateProps {
  commissionData: Props
  activeCharacters: string[]
  summary?: HomeUpdateSummary
}

const Update = ({ commissionData, activeCharacters, summary }: UpdateProps) => {
  const resolvedSummary = summary ?? buildHomeUpdateSummary(commissionData, activeCharacters)

  // 如果没有最新的委托作品，显示提示信息
  if (resolvedSummary.entries.length === 0) {
    return <p className="font-mono text-sm">No active updates found</p>
  }

  // 渲染最新的委托作品信息
  return (
    <div className="mt-6 mb-4 flex flex-col font-mono text-xs sm:text-sm md:mt-8">
      {/* 显示当前的委托总数，如果是里程碑数字则添加庆祝表情 */}
      <p className="mb-2">
        Currently {resolvedSummary.totalCommissions} commissions
        {isMilestoneCommissionCount(resolvedSummary.totalCommissions) ? ' 🎉' : ''}
      </p>

      <div className="flex items-start">
        <p className="mr-2">Last update:</p>
        <div className="flex flex-col space-y-2">
          {/* 遍历最近的委托作品条目并渲染 */}
          {resolvedSummary.entries.map(entry => {
            return (
              <p key={entry.key} className="mr-2">
                {/* 显示格式化日期并创建指向对应角色的链接 */}
                {entry.dateLabel} {'[ '}
                <HashLink href={entry.href} className="underline-offset-2">
                  {entry.character}
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
