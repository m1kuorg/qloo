// What each assistant's setup shows for the MCP server at `mcp`, as the Developers page and the MCP docs
// both give it, written out as the vendors' docs give each format: each assistant's name, then its code
// blocks, each its caption, what its Copy names (null for a block with none), and its code, a
// configuration as the value it parses to. No block holds a key: each reads it from CROSSFEED_API_KEY,
// or asks for it, or holds the docs' placeholder for it, with no Copy.
import { expect } from 'vitest'

type Block = [caption: string, copy: string | null, code: string | object]

// The key into the shell, in bash or zsh, and on Windows in PowerShell too.
const shell: Block = ['Shell', 'command that reads the key', 'read -rs CROSSFEED_API_KEY && export CROSSFEED_API_KEY']
const powershell: Block = [
  'PowerShell',
  'PowerShell commands that set the key',
  "$env:CROSSFEED_API_KEY = Read-Host 'Crossfeed API key'\nsetx CROSSFEED_API_KEY $env:CROSSFEED_API_KEY"
]
const header = { Authorization: 'Bearer ${env:CROSSFEED_API_KEY}' }

export const setups = (mcp: string): [name: string, blocks: Block[]][] => [
  [
    'Claude Code',
    [
      shell,
      [
        'Shell',
        'claude mcp add command',
        `claude mcp add --transport http crossfeed ${mcp} \\\n  --header "Authorization: Bearer $CROSSFEED_API_KEY"`
      ],
      ['Shell', 'claude mcp list command', 'claude mcp list'],
      ['Output', null, `crossfeed: ${mcp} (HTTP) - ✔ Connected`]
    ]
  ],
  [
    'Claude',
    [
      [
        'claude_desktop_config.json',
        null,
        {
          mcpServers: {
            crossfeed: {
              command: 'npx',
              args: ['-y', 'mcp-remote', mcp, '--header', 'Authorization:${AUTH_HEADER}'],
              env: { AUTH_HEADER: 'Bearer cf_live_…' }
            }
          }
        }
      ]
    ]
  ],
  [
    'Cursor',
    [
      shell,
      powershell,
      ['~/.cursor/mcp.json', 'Cursor configuration', { mcpServers: { crossfeed: { url: mcp, headers: header } } }]
    ]
  ],
  [
    'VS Code',
    [
      shell,
      powershell,
      ['mcp.json', 'VS Code configuration', { servers: { crossfeed: { type: 'http', url: mcp, headers: header } } }],
      [
        'mcp.json',
        'VS Code configuration that asks for the key',
        {
          inputs: [{ type: 'promptString', id: 'crossfeed-api-key', description: 'Crossfeed API key', password: true }],
          servers: {
            crossfeed: { type: 'http', url: mcp, headers: { Authorization: 'Bearer ${input:crossfeed-api-key}' } }
          }
        }
      ]
    ]
  ],
  [
    'Codex',
    [
      shell,
      [
        'Shell',
        'codex mcp add command',
        `codex mcp add crossfeed --url ${mcp} \\\n  --bearer-token-env-var CROSSFEED_API_KEY`
      ]
    ]
  ],
  [
    'Another MCP client',
    [
      ['URL', 'MCP server address', mcp],
      ['HTTP', null, 'Authorization: Bearer cf_live_…']
    ]
  ]
]

// A block as `setups` writes it: a configuration, in JSON, as the value it parses to.
export const parsed = ([caption, copy, code]: [string, string | null, string]): Block => [
  caption,
  copy,
  caption.endsWith('.json') ? JSON.parse(code) : code
]

// Checks that the links an assistant's setup shows, by their words and where they go, are the
// vendors' install links for the MCP server at `mcp`, each decoding to the server's entry as that
// vendor's docs give it, with the key read from CROSSFEED_API_KEY: Claude's add-custom-connector
// dialogs, prefilled, Cursor's deep link with the entry in base64, and VS Code's with it as URL-encoded
// JSON.
export function expectLinks(links: [label: string, href: string][], mcp: string) {
  expect(links.map(([label]) => label)).toEqual([
    'Add to Claude',
    'Add for your organization',
    'Add to Cursor',
    'Add to VS Code'
  ])
  const [claude, organization, cursor, vscode] = links.map(([, href]) => href)
  for (const [href, path] of [
    [claude, 'https://claude.ai/customize/connectors'],
    [organization, 'https://claude.ai/admin-settings/connectors']
  ]) {
    const url = new URL(href)
    expect(`${url.origin}${url.pathname}`).toBe(path)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      modal: 'add-custom-connector',
      connectorName: 'Crossfeed',
      connectorUrl: mcp
    })
  }
  expect(cursor).toMatch(/^cursor:\/\/anysphere\.cursor-deeplink\/mcp\/install\?name=crossfeed&config=[A-Za-z0-9%]+$/)
  const config = new URL(cursor).searchParams.get('config')!
  expect(JSON.parse(atob(config))).toEqual({ url: mcp, headers: header })
  expect(vscode).toMatch(/^vscode:mcp\/install\?%7B/)
  expect(JSON.parse(decodeURIComponent(vscode.slice('vscode:mcp/install?'.length)))).toEqual({
    name: 'crossfeed',
    type: 'http',
    url: mcp,
    headers: header
  })
}
