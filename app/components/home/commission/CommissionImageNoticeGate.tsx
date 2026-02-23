'use client'

import { useEffect, useState, type ComponentType } from 'react'

type InitialNotice = {
  left: number
  top: number
  text: string
} | null

const NOTICE_OFFSET = 14
const NOTICE_MIN_OFFSET = 12
const NOTICE_WIDTH = 356
const NOTICE_HEIGHT = 120

type CommissionImageNoticeClientProps = {
  initialNotice?: InitialNotice
}

let cachedNoticeClient: ComponentType<CommissionImageNoticeClientProps> | null = null
let noticeClientPromise: Promise<ComponentType<CommissionImageNoticeClientProps>> | null = null

const loadCommissionImageNoticeClient = async (): Promise<
  ComponentType<CommissionImageNoticeClientProps>
> => {
  if (cachedNoticeClient) return cachedNoticeClient
  if (!noticeClientPromise) {
    noticeClientPromise = import('#components/home/commission/CommissionImageNoticeClient').then(
      mod => {
        cachedNoticeClient = mod.default
        return mod.default
      },
    )
  }

  return noticeClientPromise
}

export default function CommissionImageNoticeGate() {
  const [enabled, setEnabled] = useState(false)
  const [initialNotice, setInitialNotice] = useState<InitialNotice>(null)
  const [NoticeClient, setNoticeClient] =
    useState<ComponentType<CommissionImageNoticeClientProps> | null>(() => cachedNoticeClient)

  useEffect(() => {
    if (enabled) return

    const onFirstContextMenu = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const trigger = target.closest<HTMLElement>('[data-commission-image="true"]')
      if (!trigger) return

      const altText = trigger.dataset.commissionAlt?.trim()
      if (!altText) return

      event.preventDefault()
      setInitialNotice({
        left: Math.min(
          event.clientX + NOTICE_OFFSET,
          Math.max(NOTICE_MIN_OFFSET, window.innerWidth - NOTICE_WIDTH),
        ),
        top: Math.min(
          event.clientY + NOTICE_OFFSET,
          Math.max(NOTICE_MIN_OFFSET, window.innerHeight - NOTICE_HEIGHT),
        ),
        text: altText,
      })
      void loadCommissionImageNoticeClient().then(component => {
        setNoticeClient(() => component)
      })
      setEnabled(true)
    }

    document.addEventListener('contextmenu', onFirstContextMenu)
    return () => {
      document.removeEventListener('contextmenu', onFirstContextMenu)
    }
  }, [enabled])

  if (!enabled || !NoticeClient) return null

  return <NoticeClient initialNotice={initialNotice} />
}
