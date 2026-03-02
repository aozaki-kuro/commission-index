export type AnalyticsEventProperties = Record<string, string | number | boolean>

type RybbitAnalytics = {
  event?: (name: string, properties?: AnalyticsEventProperties) => void
}

export const trackRybbitEvent = (name: string, properties?: AnalyticsEventProperties) => {
  if (typeof window === 'undefined') return

  const tracker = (window as Window & { rybbit?: RybbitAnalytics }).rybbit
  if (!tracker?.event) return

  tracker.event(name, properties)
}
