import CryptoAddress from '#features/support/components/CryptoAddress'

const SupportInteractiveIsland = () => {
  return (
    <>
      <CryptoAddress currencyName="USDT (TRC20)" address="TEHCVekfCn5FxLFayUHAVj6qGpQyRW6Usa" />
      <CryptoAddress
        currencyName="USDT (ERC20)"
        address="0xcca71d75cfc76d4b792666e600591577ebb71922"
      />
      <CryptoAddress currencyName="BTC" address="33PopHvEh47jkokX1EXv75TkUDjVFGmbWs" />
      <CryptoAddress currencyName="ETH" address="0xcca71d75cfc76d4b792666e600591577ebb71922" />

      <br />

      <CryptoAddress currencyName="Metamask" address="0x128e6E0BC4ad6d4979A6C94B860Bef4a851eF01e" />
    </>
  )
}

export default SupportInteractiveIsland
