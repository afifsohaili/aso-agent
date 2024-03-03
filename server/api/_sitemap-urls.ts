import { serverQueryContent } from '#content/server'

export default cachedEventHandler(async (event) => {
  const docs = await serverQueryContent(event).find()
  const lastmod = '2023-10-01'
  const finalUrls = [
    { loc: '/', lastmod },
  ]
  for (const doc of docs) {
    finalUrls.push({
      loc: doc._path,
      lastmod,
    })
  }
  return finalUrls
}, {
  name: 'sitemap-dynamic-urls',
  maxAge: 60 * 10, // cache URLs for 10 minutes
})
