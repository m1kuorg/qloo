// How each assistant connects to Crossfeed's MCP server at `mcp`, its address, for the Developers page's
// "Your assistant" and the MCP docs' "Connect your assistant" to render, so the two can't drift. It's
// data alone, as React and Hono's JSX both render it: in a step's sentence, each run between backticks
// is code, as in a Markdown code span, and both set it as code. No snippet or link holds a key: each
// reads it from CROSSFEED_API_KEY, or the assistant asks for it and keeps it, or the step says where to
// type it, and only the Developers page's one-time reveal shows one. Each format is as its vendor's doc
// gives it, checked on 2026-10-30: Claude Code's MCP page; Claude's pages on custom connectors and
// their install link; Cursor's MCP page and install links; VS Code's MCP configuration reference and
// its install URL; mcp-remote's README and the MCP docs' local servers guide; and Codex's MCP page.
import { CONNECTED } from './text'

// A block of code a step shows: its caption, either `label`, the language it's in ("Shell") or what it is
// ("Output"), or `file`, the file it goes in; and `copy`, what its Copy button names, when it runs as
// it's pasted (a command, or a configuration), or none for what a command prints or a format with a
// placeholder in it. A shell block holds commands alone, with no comment and no placeholder, as zsh would
// run either as words.
export type Snippet = { code: string; copy?: string } & (
  { label: string; file?: never } | { file: string; label?: never }
)

// A link that sets an assistant up, such as one that opens its app, and what it does that a reader
// should know before following it, which describes it (`id`, with "-note", names the caveat's element).
// `away` marks a web page, which opens in a tab of its own, so the page that showed a new key keeps it,
// as its caveat says.
export type Link = { id: string; label: string; href: string; caveat: string; away?: true }

// One step: its sentence, then its links, then its blocks.
export type Step = { text: string; links?: Link[]; snippets?: Snippet[] }

// An assistant: `id` names its tab and its docs heading, `name` is its words, and `steps` are the way
// to connect it, in order. `otherwise` is a way for when the steps can't work, after them, and `more` a
// closing line that leads on, its link at its end.
export type AssistantSetup = {
  id: string
  name: string
  steps: Step[]
  otherwise?: Step
  more?: { text: string; link: { label: string; href: string } }
}

// Why ChatGPT isn't among them (OpenAI's custom MCP server guide). Issue #363 asks whether to add OAuth.
export const CHATGPT =
  'ChatGPT can’t connect yet: its custom MCP servers sign in with OAuth or not at all, and Crossfeed’s MCP server takes an API key.'

// The name each assistant's configuration gives the server, as the plugin's does.
const NAME = 'crossfeed'
// The header every client sends, the key in it read from the variable as each client writes it.
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` })
// A configuration as it's pasted into its file.
const json = (value: unknown) => JSON.stringify(value, null, 2)

// The server's entry as Cursor's mcp.json holds it, which its install link carries: its address, and
// the header with the key from the environment.
const cursorEntry = (mcp: string) => ({ url: mcp, headers: bearer('${env:CROSSFEED_API_KEY}') })
// The server's entry as VS Code's mcp.json holds it, and as its install link carries it, named.
const vscodeEntry = (mcp: string) => ({
  type: 'http',
  url: mcp,
  headers: bearer('${env:CROSSFEED_API_KEY}')
})

// Cursor's install link: the entry as JSON in base64, its `=` escaped as Vercel's and Stripe's links
// escape it. VS Code's: the named entry as URL-encoded JSON, as its doc builds it.
const cursorLink = (mcp: string) =>
  `cursor://anysphere.cursor-deeplink/mcp/install?name=${NAME}&config=${encodeURIComponent(btoa(JSON.stringify(cursorEntry(mcp))))}`
const vscodeLink = (mcp: string) =>
  `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: NAME, ...vscodeEntry(mcp) }))}`
// Claude's add-custom-connector dialog, with Crossfeed's name and address filled in: an account's own,
// or an organization's, which only its Owner opens.
const claudeLink = (path: string, mcp: string) =>
  `https://claude.ai/${path}?modal=add-custom-connector&connectorName=Crossfeed&connectorUrl=${encodeURIComponent(mcp)}`

// The first step of every assistant that reads the key from the shell: the key into CROSSFEED_API_KEY
// with nothing echoed, so it's in no command and no history, its Copy named for the assistant, as the
// docs show every assistant's at once; then `windows`, what to do there, which has no `read`.
const shellKey = (name: string, windows: string): Step => ({
  text: `Put the key in your shell as \`CROSSFEED_API_KEY\`: in bash or zsh, run this, paste the key, and press Return. Nothing shows as you paste, and the key stays out of your shell’s history. ${windows}`,
  snippets: [
    {
      label: 'Shell',
      code: 'read -rs CROSSFEED_API_KEY && export CROSSFEED_API_KEY',
      copy: `${name} command that reads the key`
    }
  ]
})
// An app's adds PowerShell's: the key asked for without showing it and set for that window, then kept
// in the user's environment for apps started afterwards, with no command line holding it, as setx's
// would.
const appKey = (name: string): Step => {
  const shell = shellKey(
    name,
    'On Windows, in PowerShell, the first two lines ask for the key without showing it and set it for that window, and the third keeps it for apps you start afterwards, in plain text in your user environment.'
  )
  return {
    ...shell,
    snippets: [
      ...shell.snippets!,
      {
        label: 'PowerShell',
        code: [
          "$k = Read-Host 'Crossfeed API key' -AsSecureString",
          "$env:CROSSFEED_API_KEY = [System.Net.NetworkCredential]::new('', $k).Password",
          "[Environment]::SetEnvironmentVariable('CROSSFEED_API_KEY', $env:CROSSFEED_API_KEY, 'User')"
        ].join('\n'),
        copy: `${name} PowerShell commands that set the key`
      }
    ]
  }
}
// An app reads its environment as it starts, and one started from the Dock doesn't have what a
// terminal set. On a Mac, the app's shell command (`command`) is one its Command Palette installs.
const restart = (app: string, command: string): Step => ({
  text: `Quit ${app}, then start it again from that terminal with \`${command}\`: ${app} reads the variable as it starts, and started from the Dock, it doesn’t see one set in a terminal. On a Mac, run Shell Command: Install ‘${command}’ command in PATH from ${app}’s Command Palette once first, so the terminal has \`${command}\`.`
})
// What an app's link says beside it.
const opens = (app: string) =>
  `Opens ${app} if it’s installed. Start ${app} from the terminal where you set the variable first, or it has no key to send.`

export function assistants(mcp: string): AssistantSetup[] {
  return [
    {
      id: 'claude-code',
      name: 'Claude Code',
      steps: [
        shellKey(
          'Claude Code',
          'On Windows, run these steps in WSL or Git Bash: in PowerShell, `$CROSSFEED_API_KEY` is empty, and `claude mcp add` would save the header without the key.'
        ),
        {
          text: 'Add Crossfeed’s MCP server to Claude Code, in the folder you’ll use it from. Claude Code keeps the key from then on, in plain text in its own config file, `~/.claude.json`.',
          snippets: [
            {
              label: 'Shell',
              code: `claude mcp add --transport http ${NAME} ${mcp} \\\n  --header "Authorization: Bearer $CROSSFEED_API_KEY"`,
              copy: 'claude mcp add command'
            }
          ]
        },
        {
          text: 'Check it: `claude mcp list` should show it connected.',
          snippets: [
            { label: 'Shell', code: 'claude mcp list', copy: 'claude mcp list command' },
            { label: 'Output', code: `${NAME}: ${mcp} (HTTP) - ${CONNECTED}` }
          ]
        }
      ],
      more: {
        text: 'The Crossfeed plugin installs two skills that teach Claude Code to plan launch promos and triage guest pitches, with the MCP server: see',
        link: { label: 'Skills and plugin', href: '/docs/agents' }
      }
    },
    {
      id: 'claude',
      name: 'Claude',
      steps: [
        {
          text: 'Add Crossfeed as a custom connector, which Claude Desktop gets too: each link opens Claude’s Add custom connector dialog with Crossfeed’s name and address filled in, for you to check.',
          links: [
            {
              id: 'add-to-claude',
              label: 'Add to Claude',
              href: claudeLink('customize/connectors', mcp),
              caveat:
                'Opens claude.ai in a new tab, asking you to sign in first if you haven’t. On a Team or Enterprise plan, only an Owner, or a custom role allowed to, adds a connector, so ask an Owner.',
              away: true
            },
            {
              id: 'add-for-organization',
              label: 'Add for your organization',
              href: claudeLink('admin-settings/connectors', mcp),
              caveat:
                'Opens your organization’s connectors in a new tab, for a Team or Enterprise Owner, who adds Crossfeed for everyone in the organization, who then share its key.',
              away: true
            }
          ]
        },
        {
          text: 'For Authentication, choose No sign-in. Then under Request headers, choose `authorization`, enter `Bearer`, a space and your key, mark it Required, and choose Add. Claude keeps the key and doesn’t show it again, and can’t change these settings later: for a mistyped key, remove the connector and add it again. Request headers are a beta that only some organizations have: if the dialog has none, connect Claude Desktop as below, or use Claude Code.'
        },
        { text: 'In a chat, turn Crossfeed on under the + button’s Connectors.' }
      ],
      otherwise: {
        text: 'Without request headers, Claude Desktop can reach Crossfeed through `mcp-remote`, a bridge it runs with Node.js 18 or later. In its Settings, under Developer, choose Edit Config, add Crossfeed to `claude_desktop_config.json` as here, and type your key in place of `cf_live_…`. Then quit Claude Desktop and open it again. It keeps the key in plain text in that file.',
        snippets: [
          {
            file: 'claude_desktop_config.json',
            // No space in the argument, which Claude Desktop on Windows would split (mcp-remote's README).
            code: json({
              mcpServers: {
                [NAME]: {
                  command: 'npx',
                  args: ['-y', 'mcp-remote', mcp, '--header', 'Authorization:${AUTH_HEADER}'],
                  env: { AUTH_HEADER: 'Bearer cf_live_…' }
                }
              }
            })
          }
        ]
      }
    },
    {
      id: 'cursor',
      name: 'Cursor',
      steps: [
        appKey('Cursor'),
        restart('Cursor', 'cursor'),
        {
          text: 'Add Crossfeed’s MCP server: follow the link, and Cursor asks before it adds it, or paste this into `~/.cursor/mcp.json`, for every project. Either way, Cursor sends the key from the variable.',
          links: [{ id: 'add-to-cursor', label: 'Add to Cursor', href: cursorLink(mcp), caveat: opens('Cursor') }],
          snippets: [
            {
              file: '~/.cursor/mcp.json',
              code: json({ mcpServers: { [NAME]: cursorEntry(mcp) } }),
              copy: 'Cursor configuration'
            }
          ]
        }
      ]
    },
    {
      id: 'vscode',
      name: 'VS Code',
      steps: [
        appKey('VS Code'),
        restart('VS Code', 'code'),
        {
          text: 'Add Crossfeed’s MCP server: follow the link, and VS Code asks before it adds it, or run MCP: Open User Configuration from the Command Palette and paste this in. Either way, VS Code sends the key from the variable.',
          links: [{ id: 'add-to-vscode', label: 'Add to VS Code', href: vscodeLink(mcp), caveat: opens('VS Code') }],
          snippets: [
            {
              file: 'mcp.json',
              code: json({ servers: { [NAME]: vscodeEntry(mcp) } }),
              copy: 'VS Code configuration'
            }
          ]
        }
      ],
      otherwise: {
        text: 'Without the variable, VS Code can ask for the key as the server first starts, hide it as you type, and keep it: paste this into `mcp.json` instead.',
        snippets: [
          {
            file: 'mcp.json',
            code: json({
              inputs: [
                { type: 'promptString', id: 'crossfeed-api-key', description: 'Crossfeed API key', password: true }
              ],
              servers: { [NAME]: { ...vscodeEntry(mcp), headers: bearer('${input:crossfeed-api-key}') } }
            }),
            copy: 'VS Code configuration that asks for the key'
          }
        ]
      }
    },
    {
      id: 'codex',
      name: 'Codex',
      steps: [
        shellKey('Codex', 'On Windows, run these steps, and `codex`, in WSL or Git Bash.'),
        {
          text: 'Add Crossfeed’s MCP server to Codex. Codex reads the key from the variable each time it starts, so it never writes the key down.',
          snippets: [
            {
              label: 'Shell',
              code: `codex mcp add ${NAME} --url ${mcp} \\\n  --bearer-token-env-var CROSSFEED_API_KEY`,
              copy: 'codex mcp add command'
            }
          ]
        },
        {
          text: 'Start `codex` from a shell where the variable is set: its `/mcp` command lists Crossfeed among its servers.'
        }
      ]
    },
    {
      id: 'other',
      name: 'Another MCP client',
      steps: [
        {
          text: 'Give it the MCP server’s address, which serves Streamable HTTP.',
          snippets: [{ label: 'URL', code: mcp, copy: 'MCP server address' }]
        },
        {
          text: 'Have it send the key in the `Authorization` header, as `Bearer`, a space and the key, with every request.',
          snippets: [{ label: 'HTTP', code: 'Authorization: Bearer cf_live_…' }]
        }
      ]
    }
  ]
}
