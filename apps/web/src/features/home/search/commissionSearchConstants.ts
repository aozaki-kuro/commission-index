export const LOAD_ARCHIVED_COMMAND_VALUE = '__load-archived__'

// Surface of a keyword chip, shared by the featured chips and the "All" trigger beside them so the row reads as one set.
export const KEYWORD_CHIP_SURFACE_CLASS = [
  'rounded-full border border-gray-300/80 bg-white/75',
  'text-[11px] text-gray-700',
  'transition-colors',
  'hover:border-gray-400 hover:text-gray-900',
  'focus-visible:outline-2 focus-visible:outline-offset-2',
  'focus-visible:outline-gray-500',
  'dark:border-gray-700 dark:bg-black/40 dark:text-gray-300',
  'dark:hover:border-gray-500 dark:hover:text-gray-100',
].join(' ')
