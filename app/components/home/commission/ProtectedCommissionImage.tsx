'use client'
/* eslint-disable @next/next/no-img-element */

import { Skeleton } from '#components/ui/skeleton'
import { useCallback, useId, useRef, useState } from 'react'

type ProtectedCommissionImageProps = {
  altText: string
  resolvedImageSrc: string
}

const COMMISSION_IMAGE_WIDTH = 1280
const COMMISSION_IMAGE_HEIGHT = 525

const ProtectedCommissionImage = ({ altText, resolvedImageSrc }: ProtectedCommissionImageProps) => {
  const cacheBustId = useId()
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)

  const fallbackSrc =
    process.env.NODE_ENV === 'development'
      ? `${resolvedImageSrc}${resolvedImageSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheBustId)}`
      : resolvedImageSrc

  const isLoaded = loadedSrc === fallbackSrc
  const markLoaded = useCallback(() => setLoadedSrc(fallbackSrc), [fallbackSrc])
  const attachImageRef = useCallback(
    (node: HTMLImageElement | null) => {
      imageRef.current = node
      // Cached images can finish before React binds onLoad during hydration.
      if (node?.complete) {
        setLoadedSrc(fallbackSrc)
      }
    },
    [fallbackSrc],
  )

  return (
    <div data-commission-image="true" data-commission-alt={altText} className="relative">
      {!isLoaded ? (
        <Skeleton className="absolute inset-0 z-0 h-full w-full rounded-none" aria-hidden="true" />
      ) : null}
      <img
        ref={attachImageRef}
        src={fallbackSrc}
        alt={altText}
        className={`pointer-events-none relative z-10 transition-opacity duration-300 select-none ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        width={COMMISSION_IMAGE_WIDTH}
        height={COMMISSION_IMAGE_HEIGHT}
        style={{ width: '100%', height: 'auto' }}
        onLoad={markLoaded}
        onError={markLoaded}
      />
    </div>
  )
}

export default ProtectedCommissionImage
