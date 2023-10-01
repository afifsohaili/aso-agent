export default cachedEventHandler(async () => {
  const lastmod = '2023-10-01'
  return [
    { loc: '/', lastmod },
  ]
}, {
  name: 'sitemap-dynamic-urls',
  maxAge: 60 * 10, // cache URLs for 10 minutes
})
