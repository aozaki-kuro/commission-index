import type { Commission } from '@data/types'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import { getHomeLocaleMessages } from '@features/home/i18n/homeLocale'
import { resolveSourceImageByCommissionId } from '@lib/images/sourceImageRegistry'
import { getImage } from 'astro:assets'

export const COMMISSION_IMAGE_WIDTH = 1280
export const COMMISSION_IMAGE_SIZES = '(max-width: 768px) 92vw, 640px'

export function buildInterestPayload({
  interestKey,
  locale,
}: {
  interestKey: string
  locale: HomeLocale
}) {
  const listing = getHomeLocaleMessages(locale).listing

  return {
    key: interestKey,
    label: listing.wantThis,
    title: listing.wantThisTitle,
    recordedLabel: listing.wantThisRecorded,
    recordedTitle: listing.wantThisRecordedTitle,
  }
}

export async function buildImagePayload(commission: Commission) {
  const sourceImage = resolveSourceImageByCommissionId(commission.id)
  if (!sourceImage)
    return null

  const image = await getImage({
    src: sourceImage,
    widths: [768, 960, 1280],
    width: COMMISSION_IMAGE_WIDTH,
    format: 'webp',
    sizes: COMMISSION_IMAGE_SIZES,
  })

  return {
    src: image.src,
    srcSet: image.srcSet.attribute,
    sizes: COMMISSION_IMAGE_SIZES,
    width: Number(image.attributes.width ?? COMMISSION_IMAGE_WIDTH),
    height: Number(image.attributes.height ?? sourceImage.height),
  }
}
