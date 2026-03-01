import { Button } from '#components/ui/button'
import { SearchIcon } from './Icons'
import { STYLES } from './constants'

interface SearchJumpButtonProps {
  onClick: () => void
}

const SearchJumpButton = ({ onClick }: SearchJumpButtonProps) => {
  return (
    <Button
      type="button"
      className={STYLES.floatingButton}
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Jump to search"
      title="Search"
    >
      <SearchIcon />
    </Button>
  )
}

export default SearchJumpButton
