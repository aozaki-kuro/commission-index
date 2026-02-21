import { getCharacterSectionHash, getCharacterTitleId } from '#lib/characters/nav'
import Link from 'next/link'

type TitleProps = {
  Content: string
}

const Title = ({ Content }: TitleProps) => {
  const titleId = getCharacterTitleId(Content)
  const sectionHash = getCharacterSectionHash(Content)

  return (
    <div id={titleId} className="mb-2 pt-4">
      <h2 className="group relative">
        {Content}
        <Link
          href={sectionHash}
          className="ml-2 font-bold text-gray-400 no-underline opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-gray-600"
        >
          #
        </Link>
      </h2>
    </div>
  )
}

export default Title
