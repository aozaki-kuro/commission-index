export type AnalyticsEventProperties = Record<string, string | number | boolean>

interface RybbitAnalytics {
  event?: (name: string, properties?: AnalyticsEventProperties) => void
}

interface PendingAnalyticsEvent {
  name: string
  properties?: AnalyticsEventProperties
}

type AnalyticsWindow = Window & {
  rybbit?: RybbitAnalytics
  __pendingRybbitEvents?: PendingAnalyticsEvent[]
}

export function trackRybbitEvent(name: string, properties?: AnalyticsEventProperties) {
  if (typeof window === 'undefined')
    return

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
