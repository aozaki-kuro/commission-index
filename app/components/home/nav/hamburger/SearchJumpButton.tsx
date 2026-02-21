import { SearchIcon } from './Icons'
import { STYLES } from './constants'

interface SearchJumpButtonProps {
  onClick: () => void
}

const SearchJumpButton = ({ onClick }: SearchJumpButtonProps) => {
  return (
    <button
      type="button"
      className={STYLES.floatingButton}
      onClick={onClick}
      aria-label="Jump to search"
      title="Search"
    >
      <SearchIcon />
    </button>
  )
}

export default SearchJumpButton
