import AppLink from '#components/shared/AppLink'
import { useDocumentTitle } from '#lib/seo/useDocumentTitle'

import CryptoAddress from './components/CryptoAddress'

const Support = () => {
  useDocumentTitle('Support')

  return (
    <div className="mx-auto max-w-[40rem]">
      <h1 className="pb-4 md:pb-6">Support me!</h1>

      {/* ======= Text ======= */}

      <div>
        <p className="pb-4 md:pb-6">
          Please consider support me if you appreciated the works I commissioned!
        </p>
        <p className="pb-4 md:pb-6">
          Commissioning such high-quality artworks at this pace made the entire project quite
          time-consuming and extremely expensive. Currently I found myself spending around 20k - 40k
          JPY on these each month. Therefore, any financial assistance you can provide, even a few
          dollars, would be greatly appreciated.
        </p>
        <p className="pb-4 md:pb-6">
          I&apos;m also thinking of replacing my very, very old car so I will be saving money from
          2024.
        </p>
      </div>

      {/* ======= Crypto ======= */}
      <h2 className="pb-4 text-base md:pb-6 md:text-lg">Crypto Currencies</h2>

      <div className="">
        <CryptoAddress currencyName="USDT (TRC20)" address="TEHCVekfCn5FxLFayUHAVj6qGpQyRW6Usa" />
        <CryptoAddress
          currencyName="USDT (ERC20)"
          address="0xcca71d75cfc76d4b792666e600591577ebb71922"
        />
        <CryptoAddress currencyName="BTC" address="33PopHvEh47jkokX1EXv75TkUDjVFGmbWs" />

        <CryptoAddress currencyName="ETH" address="0xcca71d75cfc76d4b792666e600591577ebb71922" />

        <br />

        <CryptoAddress
          currencyName="Metamask"
          address="0x128e6E0BC4ad6d4979A6C94B860Bef4a851eF01e"
        />

        <p className="hidden md:block md:pt-6 md:pb-6">
          Please click on the addresses to copy to clipboard.
        </p>
      </div>

      {/* ======= Footer ======= */}

      <div className="pt-8 md:pt-4" />
      <hr />
      <div className="pb-4 md:pb-6" />

      <p className="pt-4 pb-4 md:pb-6">Thank you!</p>

      <p className="pb-4 md:pb-6">Please remember to follow and support the illustrators!</p>

      <div className="pb-6" />

      <AppLink href="/" className="pb-4 md:pb-6">
        Back to Home
      </AppLink>
    </div>
  )
}

export default Support
