// One table per view-mode toggle group. The mount code and the pre-paint script in
// server/StaticCommissionSections.astro (via define:vars) both read these, so `?view=timeline` paints the same
// classes the mount code later toggles.
export interface ViewModeToggleClassTable {
  toggleSelector: string
  indicatorSelector: string
  activeTextClasses: readonly string[]
  inactiveTextClasses: readonly string[]
  activeIndicatorClasses: readonly string[]
  inactiveIndicatorClasses: readonly string[]
}

export const SIDEBAR_VIEW_MODE_TOGGLE_CLASSES = {
  toggleSelector: '[data-sidebar-view-mode-toggle="true"]',
  indicatorSelector: '[data-sidebar-view-mode-indicator]',
  activeTextClasses: ['text-gray-900', 'dark:text-white'],
  inactiveTextClasses: ['text-gray-700', 'dark:text-gray-200'],
  activeIndicatorClasses: ['scale-100', 'opacity-100'],
  inactiveIndicatorClasses: ['scale-95', 'opacity-0'],
} as const satisfies ViewModeToggleClassTable

export const MOBILE_VIEW_MODE_TAB_CLASSES = {
  toggleSelector: '[data-mobile-view-mode-toggle="true"]',
  indicatorSelector: '[data-mobile-view-mode-indicator]',
  activeTextClasses: ['text-gray-700', 'dark:text-gray-300'],
  inactiveTextClasses: ['text-gray-500', 'dark:text-gray-400'],
  activeIndicatorClasses: ['scale-x-100', 'opacity-100'],
  inactiveIndicatorClasses: ['scale-x-0', 'opacity-0'],
} as const satisfies ViewModeToggleClassTable

export const HAMBURGER_VIEW_MODE_TOGGLE_CLASSES = {
  toggleSelector: '[data-mobile-hamburger-view-mode-toggle="true"]',
  indicatorSelector: '[data-mobile-hamburger-view-mode-indicator]',
  activeTextClasses: ['text-gray-900', 'dark:text-white'],
  inactiveTextClasses: ['text-gray-800', 'dark:text-gray-100'],
  activeIndicatorClasses: ['scale-100', 'opacity-100'],
  inactiveIndicatorClasses: ['scale-95', 'opacity-0'],
} as const satisfies ViewModeToggleClassTable

/** Mirrors the inline pre-paint script's syncToggleGroupState for one button (minus aria-pressed). */
export function applyViewModeToggleClasses(
  button: HTMLElement,
  table: ViewModeToggleClassTable,
  active: boolean,
) {
  table.activeTextClasses.forEach(className => button.classList.toggle(className, active))
  table.inactiveTextClasses.forEach(className => button.classList.toggle(className, !active))

  const indicator = button.querySelector<HTMLElement>(table.indicatorSelector)
  if (!indicator)
    return
  table.activeIndicatorClasses.forEach(className => indicator.classList.toggle(className, active))
  table.inactiveIndicatorClasses.forEach(className => indicator.classList.toggle(className, !active))
}
