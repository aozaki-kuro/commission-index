import { useEffect } from 'react'

type AnalyticsEventProperties = Record<string, string | number | boolean>

type PendingAnalyticsEvent = {
  name: string
  properties?: AnalyticsEventProperties
}

type RybbitAnalytics = {
  event?: (name: string, properties?: AnalyticsEventProperties) => void
}

type AnalyticsWindow = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
  cancelIdleCallback?: (handle: number) => void
  rybbit?: RybbitAnalytics
  __pendingRybbitEvents?: PendingAnalyticsEvent[]
}

const Analytics = () => {
  useEffect(() => {
    if (import.meta.env?.DEV) return

    const analyticsWindow = window as AnalyticsWindow
    let idleHandle: number | undefined
    let timeoutHandle: number | undefined
    let mounted = true
    let appendedScript: HTMLScriptElement | null = null

    const flushPendingEvents = () => {
      const tracker = analyticsWindow.rybbit?.event
      const pendingEvents = analyticsWindow.__pendingRybbitEvents
      if (!tracker || !pendingEvents?.length) return

      for (const event of pendingEvents) {
        tracker(event.name, event.properties)
      }
      analyticsWindow.__pendingRybbitEvents = []
    }

    const loadAnalyticsScript = () => {
      if (!mounted) return

      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src="https://sight.crystallize.cc/api/script.js"]',
      )
      if (existingScript) {
        flushPendingEvents()
        return
      }

      const script = document.createElement('script')
      script.src = 'https://sight.crystallize.cc/api/script.js'
      script.defer = true
      script.dataset.siteId = '4d95bd3dc21f'
      script.addEventListener('load', flushPendingEvents, { once: true })
      document.body.appendChild(script)
      appendedScript = script
    }

    if (analyticsWindow.requestIdleCallback) {
      idleHandle = analyticsWindow.requestIdleCallback(loadAnalyticsScript, { timeout: 4000 })
    } else {
      timeoutHandle = window.setTimeout(loadAnalyticsScript, 1200)
    }

    return () => {
      mounted = false
      if (idleHandle !== undefined) analyticsWindow.cancelIdleCallback?.(idleHandle)
      if (timeoutHandle !== undefined) window.clearTimeout(timeoutHandle)
      appendedScript?.remove()
    }
  }, [])

  return null
}

export default Analytics
