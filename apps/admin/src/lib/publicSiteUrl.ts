export function getPublicSiteUrl() {
  if (typeof window === 'undefined') {
    return 'https://crystallize.cc'
  }

  const { hostname, protocol } = window.location
  if (hostname === '127.0.0.1' || hostname === 'localhost') {
    return 'http://localhost:4321'
  }

  if (hostname === 'admin.crystallize.cc') {
    return 'https://crystallize.cc'
  }

  return `${protocol}//${hostname}`
}
