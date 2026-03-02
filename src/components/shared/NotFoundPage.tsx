import AppLink from '#components/shared/AppLink'
import { useDocumentTitle } from '#lib/seo/useDocumentTitle'

const NotFoundPage = () => {
  useDocumentTitle('404')

  return (
    <div className="mx-auto max-w-2xl py-16 text-center">
      <h1>404</h1>
      <p className="pb-6">Page not found.</p>
      <AppLink href="/">Back to Home</AppLink>
    </div>
  )
}

export default NotFoundPage
