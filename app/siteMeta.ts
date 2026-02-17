import { Metadata } from 'next'

const Site = 'Commission Index'
const Description = 'The collection of commissioned NSFW illustrations / Do Not Repost'
const SocialImage = '/nsfw-cover-s.jpg'
const CanonicalUrl = 'https://crystallize.cc'

export const SiteMeta: Metadata = {
  metadataBase: new URL(CanonicalUrl),

  /* No index */
  robots: 'noindex',

  /* Base */
  title: Site,
  description: Description,

  /* OpenGraph */
  openGraph: {
    title: Site,
    siteName: Site,
    description: Description,
    images: [
      {
        url: SocialImage,
        width: 800,
        height: 451,
        alt: Site,
      },
    ],
    type: 'website',
    url: CanonicalUrl,
  },

  /* Twitter */
  twitter: {
    card: 'summary_large_image',
    title: Site,
    description: Description,
    images: [SocialImage],
    site: '@CrystallizeSub',
  },

  applicationName: Site,
  other: {
    'theme-color': '#9D3757',
  },

  icons: {
    icon: { url: '/favicon.ico' },
    shortcut: ['/favicon/android-chrome-192x192.png'],
    apple: [
      { url: '/favicon/apple-touch-icon.png' },
      { url: '/favicon/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    ],
    other: [
      {
        rel: 'apple-touch-icon-precomposed',
        url: '/favicon/apple-touch-icon.png',
      },
    ],
  },
}
