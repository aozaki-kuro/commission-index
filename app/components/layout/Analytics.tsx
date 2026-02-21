import Script from 'next/script'

const Analytics = () => {
  if (process.env.NODE_ENV === 'development') {
    return null
  }

  return (
    <Script
      src="https://sight.crystallize.cc/api/script.js"
      data-site-id="4d95bd3dc21f"
      strategy="lazyOnload"
    />
  )
}

export default Analytics
