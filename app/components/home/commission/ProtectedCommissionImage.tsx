import Image, { type StaticImageData } from 'next/image'
import { useId } from 'react'

type ProtectedCommissionImageProps = {
  altText: string
  mappedImage?: StaticImageData
  resolvedImageSrc: string
}

const COMMISSION_IMAGE_WIDTH = 1280
const COMMISSION_IMAGE_HEIGHT = 525

const ProtectedCommissionImage = ({
  altText,
  mappedImage,
  resolvedImageSrc,
}: ProtectedCommissionImageProps) => {
  const cacheBustId = useId()

  const fallbackSrc =
    process.env.NODE_ENV === 'development'
      ? `${resolvedImageSrc}${resolvedImageSrc.includes('?') ? '&' : '?'}v=${encodeURIComponent(cacheBustId)}`
      : resolvedImageSrc

  return (
    <div data-commission-image="true" data-commission-alt={altText}>
      {mappedImage ? (
        <Image
          src={mappedImage}
          alt={altText}
          placeholder="blur"
          className="pointer-events-none select-none"
          loading="lazy"
        />
      ) : (
        <Image
          src={fallbackSrc}
          alt={altText}
          className="pointer-events-none select-none"
          loading="lazy"
          unoptimized
          width={COMMISSION_IMAGE_WIDTH}
          height={COMMISSION_IMAGE_HEIGHT}
          style={{ width: '100%', height: 'auto' }}
        />
      )}
    </div>
  )
}

export default ProtectedCommissionImage
