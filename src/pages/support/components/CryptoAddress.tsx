import { useState } from 'react'

interface CryptoAddressProps {
  currencyName: string
  address: string
}

const CryptoAddress = ({ currencyName, address }: CryptoAddressProps) => {
  const [showFeedback, setShowFeedback] = useState(false)

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(address)
    setShowFeedback(true)
    setTimeout(() => setShowFeedback(false), 2000)
  }

  return (
    <li>
      <b>{currencyName}</b> {' - '}
      <button
        type="button"
        className="hidden cursor-pointer font-mono md:inline"
        onClick={copyToClipboard}
        aria-label={`Copy ${currencyName} address`}
      >
        {address}
      </button>
      <button
        type="button"
        className="inline cursor-pointer text-gray-600 md:hidden dark:text-gray-200"
        onClick={copyToClipboard}
        aria-label={`Copy ${currencyName} address`}
      >
        Click to copy
      </button>
      {showFeedback && (
        <span className="animate-fade-in-out ml-2.5 font-mono text-xs font-bold text-green-600 md:text-sm">
          Copied!
        </span>
      )}
    </li>
  )
}

export default CryptoAddress
