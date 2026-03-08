import { Button } from '#components/ui/button'
import { PopoverContent } from '#components/ui/popover'
import type { HomeLocaleMessages } from '#features/home/i18n/homeLocale'

type CommissionSearchHelpPopoverProps = {
  controls: HomeLocaleMessages['controls']
  onOpenChange: (open: boolean) => void
}

export default function CommissionSearchHelpPopover({
  controls,
  onOpenChange,
}: CommissionSearchHelpPopoverProps) {
  return (
    <PopoverContent
      side="bottom"
      align="end"
      collisionPadding={12}
      className="w-[min(calc(100vw-1rem),26rem)] border-gray-300/80 bg-white/95 p-0 text-gray-700 md:text-base dark:border-gray-700 dark:bg-black/90 dark:text-gray-300"
    >
      <div className="space-y-3 p-4">
        <h2 className="text-base font-bold text-gray-900 md:text-lg dark:text-gray-100">
          {controls.searchHelpTitle}
        </h2>
        <p className="text-xs md:text-sm">{controls.searchHelpIntro}</p>

        <div className="max-h-[min(50vh,22rem)] overflow-auto rounded-lg border border-gray-200/90 dark:border-gray-700/90">
          <table className="w-full min-w-[18rem] border-separate border-spacing-0 text-left text-xs leading-relaxed md:text-sm">
            <thead className="sticky top-0 bg-gray-100/90 text-gray-600 dark:bg-gray-800/90 dark:text-gray-300">
              <tr>
                <th className="px-3 py-2 font-semibold">{controls.searchHelpSyntaxHeader}</th>
                <th className="px-3 py-2 font-semibold">{controls.searchHelpMeaningHeader}</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700/80">
              {controls.searchHelpRows.map(row => (
                <tr key={row.syntax} className="align-top">
                  <td className="w-20 px-3 py-2.5">
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-700 md:text-xs dark:bg-gray-800 dark:text-gray-200">
                      {row.syntax}
                    </code>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] sm:text-xs md:text-sm">
                    <p>{row.description}</p>
                    <p className="mt-0.5 wrap-break-word text-gray-500 dark:text-gray-400">
                      {controls.searchHelpExampleLabel}:{' '}
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 md:text-xs dark:bg-gray-800 dark:text-gray-300">
                        {row.example}
                      </code>
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] wrap-break-word text-gray-500 sm:text-xs md:text-sm dark:text-gray-400">
          {controls.searchHelpCombinedExampleLabel}:{' '}
          <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[11px] text-gray-600 md:text-xs dark:bg-gray-800 dark:text-gray-300">
            blue hair | silver !sketch
          </code>
        </p>
        <p className="text-[11px] wrap-break-word text-gray-500 sm:text-xs md:text-sm dark:text-gray-400">
          {controls.searchHelpAliasHint}
        </p>
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            variant="outline"
            size="sm"
            className="rounded-md border border-gray-300/80 bg-white/85 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:border-gray-600 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:outline-gray-300"
          >
            {controls.searchHelpClose}
          </Button>
        </div>
      </div>
    </PopoverContent>
  )
}
