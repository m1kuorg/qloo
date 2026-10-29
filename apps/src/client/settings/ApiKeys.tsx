import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { linkVariants } from '@/components/ui/variants'
import type { ApiKey } from '../../directory'
import { MAX_NAME } from '../../text'
import { useConfirm } from '../Confirm'
import { Alert, day, ScrollTable, send, ShownOnce, useAction } from '../controls'
import type { NetworkPage } from '../NetworkPage'
import { StateLine } from '../states'
import { cell, head, Module } from './Module'

// The settings' API keys module: the keys a script or an assistant acts for the network with, through
// the API, short of approving anything (ADR 0002). An owner creates one, sees its secret this once,
// and revokes it, which stops it at once; the list shows each by its prefix and dates. `keys` is null
// for a member, who sees only who makes them. Its last line leads owners and members alike to Connect
// your AI, on the Developers page, for how an assistant connects with a key.
export function ApiKeysModule({ network, keys }: { network: NetworkPage; keys: ApiKey[] | null }) {
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <Module
      id="set-keys-h"
      title="API keys"
      heading={heading}
      description={`Each key lets a script or an assistant act for ${network.name} through Crossfeed’s API, short of approving anything: only a member approves an insertion order or a reply, in the app.`}
    >
      {keys ? (
        <OwnerKeys network={network} keys={keys} heading={heading} />
      ) : (
        <p className="text-muted-foreground">Only an owner can create and revoke API keys.</p>
      )}
      <p className="text-muted-foreground">
        To connect an assistant such as Claude Code with a key, follow{' '}
        <a className={linkVariants()} href={`${network.links.developers}#connect`}>
          Connect your AI
        </a>{' '}
        on the Developers page.
      </p>
    </Module>
  )
}

function OwnerKeys({
  network,
  keys: listed,
  heading
}: {
  network: NetworkPage
  keys: ApiKey[]
  heading: React.RefObject<HTMLHeadingElement | null>
}) {
  const [keys, setKeys] = useState(listed)
  const [name, setName] = useState('')
  const [made, setMade] = useState<{ id: string; secret: string } | null>(null)
  const { busy, error, run, clear } = useAction()
  const { confirm, dialog } = useConfirm(heading)
  const path = `/app/${network.id}/settings/api-keys`

  const create = async () => {
    const created = await run(async () => {
      const answer = await send<{ id: string; secret: string; keys: ApiKey[] }>(path, { name })
      setMade({ id: answer.id, secret: answer.secret })
      setKeys(answer.keys)
      setName('')
    })
    // A refusal, or a request that failed, stops showing the key made before, so the refusal doesn't
    // read as if this key was made. A success has already replaced it.
    if (!created) setMade(null)
  }
  const askRevoke = (k: ApiKey) =>
    confirm({
      title: `Revoke ${k.name}?`,
      consequence: 'Every script or assistant using it is refused from its next request.',
      verb: 'Revoke',
      busy: 'Revoking…',
      keep: 'Keep',
      action: async () => {
        setKeys((await send<{ keys: ApiKey[] }>(`${path}/${k.id}/revoke`)).keys)
        setMade((m) => (m?.id === k.id ? null : m))
        // A refusal shown from creating one no longer describes the list. A failed revoke shows its
        // own refusal in the confirm.
        clear()
      }
    })

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <Field>
          <FieldLabel htmlFor="key-name">Key name</FieldLabel>
          <div className="flex flex-wrap gap-2">
            <Input
              id="key-name"
              className="max-w-sm flex-1 basis-56"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              placeholder="Such as Nightly roster sync"
              required
            />
            <Button type="submit" variant="secondary" disabled={busy || !name.trim()}>
              {busy && <Spinner data-icon="inline-start" />}
              {busy ? 'Working…' : 'Create API key'}
            </Button>
          </div>
        </Field>
      </form>
      {made && (
        <ShownOnce key={made.id} id="key-secret" label="New API key" noun="key" value={made.secret} mono>
          Copy it now and keep it where your script keeps secrets: Crossfeed shows each key only once. Send it as{' '}
          <code className="font-mono">Authorization: Bearer</code> and the key.
        </ShownOnce>
      )}
      <Alert error={error} />
      {keys.length === 0 ? (
        <p>
          <StateLine kind="empty">No API keys in use.</StateLine>
        </p>
      ) : (
        <ScrollTable label="API keys table">
          <table className="relative w-full min-w-[20rem] border-separate border-spacing-0">
            <thead className="type-caption text-muted-foreground">
              <tr>
                <th scope="col" className={head}>
                  Key
                </th>
                <th scope="col" className={head}>
                  Created
                </th>
                <th scope="col" className={head}>
                  Last used
                </th>
                <th scope="col" className={head}>
                  <span className="vh">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <th scope="row" className={`${cell} text-left font-normal`}>
                    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-medium">{k.name}</span>
                      {made?.id === k.id && <Badge variant="outline">New</Badge>}
                    </span>
                    <code className="block font-mono type-caption text-muted-foreground">{k.prefix}…</code>
                  </th>
                  <td className={`${cell} whitespace-nowrap`}>
                    {day(k.created)}
                    {k.by && <span className="block type-caption text-muted-foreground">by {k.by}</span>}
                  </td>
                  <td className={`${cell} whitespace-nowrap text-muted-foreground`}>
                    {k.lastUsed === null ? 'Never' : day(k.lastUsed)}
                  </td>
                  <td className={`${cell} pr-0 text-right`}>
                    <Button variant="ghost" size="sm" onClick={() => askRevoke(k)}>
                      Revoke
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollTable>
      )}
      <p className="text-muted-foreground">
        Programs name this network by its ID, <code className="font-mono text-foreground">{network.id}</code>. The API’s
        requests and answers are in its{' '}
        <a className={linkVariants()} href="/api/v1/openapi.json">
          OpenAPI document
        </a>
        .
      </p>
      {dialog}
    </>
  )
}
