import type { Commission } from '@data/types'
import type { HomeLocale } from '@features/home/i18n/homeLocale'
import { COMMISSION_IMAGE_SIZES, COMMISSION_IMAGE_WIDTH } from '@features/home/commission/commissionImageConstants'
import { getHomeLocaleMessages } from '@features/home/i18n/homeLocale'
import { resolveSourceImageByCommissionId } from '@lib/images/sourceImageRegistry'
import { getImage } from 'astro:assets'

// Batch payload files still import the sizes constant from here until the batch modules are removed.
export { COMMISSION_IMAGE_SIZES }

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
