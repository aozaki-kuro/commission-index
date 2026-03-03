type ProtectedCommissionImageProps = {
  altText: string
  resolvedImageSrc: string
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
    `${stem}-960${extension}${queryPart} 960w`,
    `${stem}-1280${extension}${queryPart} 1280w`,
  ].join(', ')
}

const ProtectedCommissionImage = ({ altText, resolvedImageSrc }: ProtectedCommissionImageProps) => {
  const srcSet = buildResponsiveSrcSet(resolvedImageSrc)

  return (
    <div data-commission-image="true" data-commission-alt={altText} className="relative">
      <img
        data-commission-image-node="true"
        src={resolvedImageSrc}
        srcSet={srcSet || undefined}
        sizes={srcSet ? COMMISSION_IMAGE_SIZES : undefined}
        alt={altText}
        className="pointer-events-none relative z-10 select-none"
        loading="lazy"
        width={COMMISSION_IMAGE_WIDTH}
        height={COMMISSION_IMAGE_HEIGHT}
        style={{ width: '100%', height: 'auto' }}
      />
    </div>
  )
}

export default ProtectedCommissionImage
