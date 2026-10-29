// The public pages, which a search engine may index and a link preview show, by path, in the sitemap's
// order: the signed-out pages and signing in, each with its card's title, the page's own without the
// product's name, which the card's site name says, and on the landing page the claim.
export const publicPages: Record<string, string> = {
  '/': 'Rank by who listens',
  '/privacy': 'Privacy',
  '/terms': 'Beta terms',
  '/docs': 'Developer docs',
  '/docs/api': 'REST API · Developer docs',
  '/docs/sdk': 'TypeScript SDK · Developer docs',
  '/docs/mcp': 'MCP server · Developer docs',
  '/docs/agents': 'Skills and plugin · Developer docs',
  '/sign-in': 'Sign in'
}
