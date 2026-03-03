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
const IMAGE_CONTAINER_SELECTOR = '[data-commission-image="true"]'
const IMAGE_NODE_SELECTOR = '[data-commission-image-node="true"]'
const IMAGE_SKELETON_SELECTOR = '[data-commission-image-skeleton="true"]'
const IMAGE_FALLBACK_SELECTOR = '[data-commission-image-fallback="true"]'

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
    noticeClientPromise = import('#features/home/commission/CommissionImageNoticeClient').then(
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
    const imageContainers = document.querySelectorAll<HTMLElement>(IMAGE_CONTAINER_SELECTOR)
    const cleanupFns: Array<() => void> = []

    const showLoaded = (container: HTMLElement, image: HTMLImageElement) => {
      image.classList.remove('opacity-0')
      image.classList.add('opacity-100')

      const skeleton = container.querySelector<HTMLElement>(IMAGE_SKELETON_SELECTOR)
      if (skeleton) {
        skeleton.classList.remove('opacity-100')
        skeleton.classList.add('opacity-0')
      }

      const fallback = container.querySelector<HTMLElement>(IMAGE_FALLBACK_SELECTOR)
      if (fallback) {
        fallback.classList.remove('flex')
        fallback.classList.add('hidden')
      }
    }

    const showError = (container: HTMLElement, image: HTMLImageElement) => {
      image.classList.remove('opacity-100')
      image.classList.add('opacity-0')

      const skeleton = container.querySelector<HTMLElement>(IMAGE_SKELETON_SELECTOR)
      if (skeleton) {
        skeleton.classList.remove('opacity-100')
        skeleton.classList.add('opacity-0')
      }

      const fallback = container.querySelector<HTMLElement>(IMAGE_FALLBACK_SELECTOR)
      if (fallback) {
        fallback.classList.remove('hidden')
        fallback.classList.add('flex')
      }
    }

    imageContainers.forEach(container => {
      const image = container.querySelector<HTMLImageElement>(IMAGE_NODE_SELECTOR)
      if (!image) return

      const onLoad = () => {
        showLoaded(container, image)
      }
      const onError = () => {
        showError(container, image)
      }

      image.addEventListener('load', onLoad)
      image.addEventListener('error', onError)

      if (image.complete) {
        if (image.naturalWidth > 0) {
          showLoaded(container, image)
        } else {
          showError(container, image)
        }
      }

      cleanupFns.push(() => {
        image.removeEventListener('load', onLoad)
        image.removeEventListener('error', onError)
      })
    })

    return () => {
      cleanupFns.forEach(cleanup => cleanup())
    }
  }, [])

  useEffect(() => {
    if (enabled) return

    const onFirstContextMenu = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const trigger = target.closest<HTMLElement>(IMAGE_CONTAINER_SELECTOR)
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
