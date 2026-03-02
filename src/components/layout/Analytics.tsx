import { useEffect } from 'react'

const Analytics = () => {
  useEffect(() => {
    if (import.meta.env.DEV) return

    const script = document.createElement('script')
    script.src = 'https://sight.crystallize.cc/api/script.js'
    script.defer = true
    script.dataset.siteId = '4d95bd3dc21f'
    document.body.appendChild(script)

    return () => {
      script.remove()
    }
  }, [])

  return null
}

export default Analytics
