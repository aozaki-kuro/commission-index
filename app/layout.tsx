import Analytics from '#components/layout/Analytics'
import { SiteMeta } from './siteMeta'

import './globals.css'

/* Custom Font */
import { IBM_Plex_Sans } from 'next/font/google'
import localFont from 'next/font/local'

/* Alternative
const customMono = IBM_Plex_Mono({
  variable: '--font-mono',
  display: 'block',
  style: 'normal',
  weight: ['400'],
  subsets: ['latin'],
})
  */

const customMono = localFont({
  src: './fonts/BerkeleyMono-Regular.woff2',
  variable: '--font-mono',
  display: 'swap',
  style: 'normal',
})

const plexSans = IBM_Plex_Sans({
  variable: '--font-sans',
  display: 'swap',
  style: 'normal',
  weight: ['400', '600'],
  subsets: ['latin'],
})

export const metadata = SiteMeta

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${customMono.variable} font-sans`}>
      <body className="min-h-dvh antialiased selection:bg-gray-400/25 dark:bg-neutral-900">
        <div className="mx-4 min-h-dvh max-w-2xl pt-7 pb-16 text-sm leading-relaxed sm:pt-20 sm:pb-32 sm:text-base md:mx-auto md:min-h-screen">
          {children}
        </div>
        <Analytics />
      </body>
    </html>
  )
}
