type ProtectedCommissionImageProps = {
  altText: string
  resolvedImageSrc: string
  priority?: boolean
}

const COMMISSION_IMAGE_WIDTH = 1280
const COMMISSION_IMAGE_HEIGHT = 525
const COMMISSION_IMAGE_SIZES = '(max-width: 768px) 92vw, 640px'

export const buildResponsiveSrcSet = (src: string) => {
  const queryIndex = src.indexOf('?')
  const pathPart = queryIndex === -1 ? src : src.slice(0, queryIndex)
  const queryPart = queryIndex === -1 ? '' : src.slice(queryIndex)
  const extensionIndex = pathPart.lastIndexOf('.')

  if (extensionIndex === -1) {
    return ''
  }

  const stem = pathPart.slice(0, extensionIndex)
  const extension = pathPart.slice(extensionIndex)

  return [
    `${stem}-768${extension}${queryPart} 768w`,
    `${stem}-960${extension}${queryPart} 960w`,
    `${stem}-1280${extension}${queryPart} 1280w`,
  ].join(', ')
}

const ProtectedCommissionImage = ({
  altText,
  resolvedImageSrc,
  priority = false,
}: ProtectedCommissionImageProps) => {
  const srcSet = buildResponsiveSrcSet(resolvedImageSrc)

  return (
    <div data-commission-image="true" data-commission-alt={altText} className="relative">
      <div
        data-commission-image-skeleton="true"
        aria-hidden="true"
        className="absolute inset-0 animate-pulse bg-gray-200/80 dark:bg-gray-700/60"
      />
      <img
        data-commission-image-node="true"
        src={resolvedImageSrc}
        srcSet={srcSet || undefined}
        sizes={srcSet ? COMMISSION_IMAGE_SIZES : undefined}
        alt={altText}
        className="pointer-events-none relative z-10 block w-full select-none"
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        width={COMMISSION_IMAGE_WIDTH}
        height={COMMISSION_IMAGE_HEIGHT}
        style={{ height: 'auto' }}
      />
    </div>
  )
}

export default ProtectedCommissionImage
