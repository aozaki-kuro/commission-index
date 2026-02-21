import Link from 'next/link'

import Update from '#components/home/blocks/Update'
import Title from '#components/shared/Title'

const CommissionDescription = () => {
  return (
    <div id="--------Description--------">
      <h1 className="pb-0 md:pb-2">Commission Index</h1>
      <Title Content="Introduction" />

      <p className="pt-4">
        Preview images are displayed alongside their corresponding links to platforms like Twitter,
        Pixiv, or Fantia when available. By clicking on these links, you can view the full image.
        You can also subscribe for updates through{' '}
        <Link href="./rss" target="_blank" prefetch={false}>
          RSS
        </Link>
        .
      </p>
      <p className="pt-4 md:pt-6">
        I am not an illustrator but someone who frequently commissions artworks. If you appreciate
        the illustrations, please consider following and supporting the illustrators.
        <br />
        You may also consider to <Link href="/support">support my commission projects</Link>.
      </p>
      <p className="pt-4 md:pt-6">
        If any illustrators or readers wish to get in touch, don&apos;t hesitate to reach out
        through <Link href="https://odaibako.net/u/CrystallizeSub">odaibako</Link> or{' '}
        <Link href="mailto:contact@crystallize.cc">Email</Link>. Please note, any requests regarding
        the release or distribution of the illustrations will be ignored.
      </p>
      <Update />
    </div>
  )
}

export default CommissionDescription
