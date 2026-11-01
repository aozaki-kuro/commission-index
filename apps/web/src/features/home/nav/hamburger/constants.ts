export const MENU_TRANSITION_MS = 220

export const STYLES = {
  // The floating buttons sit over artwork as often as over the page, so a hairline ring plus a tight and a wide
  // shadow lift them off both; the old 8%/2px shadow let them blend in.
  floatingButton:
    'relative z-70 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-gray-900 shadow-[0_1px_2px_rgb(0_0_0/0.08),0_6px_20px_rgb(0_0_0/0.16)] ring-1 ring-black/8 backdrop-blur-[12px] transition-[background-color,box-shadow] duration-300 hover:bg-gray-100/80 hover:shadow-[0_2px_4px_rgb(0_0_0/0.1),0_10px_28px_rgb(0_0_0/0.2)] hover:ring-black/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-500 dark:bg-gray-900/80 dark:text-white dark:shadow-[0_1px_2px_rgb(0_0_0/0.3),0_6px_20px_rgb(0_0_0/0.5)] dark:ring-white/15 dark:hover:bg-gray-800/80 dark:hover:shadow-[0_2px_4px_rgb(0_0_0/0.35),0_10px_28px_rgb(0_0_0/0.6)] dark:hover:ring-white/20 dark:focus-visible:outline-gray-400',
  listItem:
    'group flex w-full items-center py-(--menu-pad) text-(length:--menu-font) leading-[1.15] font-semibold tracking-[0.007em] text-gray-800 !no-underline dark:text-gray-100',
} as const
