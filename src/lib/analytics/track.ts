export type AnalyticsEventProperties = Record<string, string | number | boolean>

type RybbitAnalytics = {
  event?: (name: string, properties?: AnalyticsEventProperties) => void
}

type PendingAnalyticsEvent = {
  name: string
  properties?: AnalyticsEventProperties
}

type AnalyticsWindow = Window & {
  rybbit?: RybbitAnalytics
  __pendingRybbitEvents?: PendingAnalyticsEvent[]
}

export const trackRybbitEvent = (name: string, properties?: AnalyticsEventProperties) => {
  if (typeof window === 'undefined') return

  const analyticsWindow = window as AnalyticsWindow
  const tracker = analyticsWindow.rybbit
  if (tracker?.event) {
    tracker.event(name, properties)
    return
  }

  const pendingEvents = analyticsWindow.__pendingRybbitEvents ?? []
  pendingEvents.push({ name, properties })
  analyticsWindow.__pendingRybbitEvents = pendingEvents.slice(-40)
}
