import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Spinner } from '@/components/ui/spinner'
import type { OwnKey, Usage } from '../../gateway'
import { QLOO_HOSTS } from '../../qloo-hosts'
import { useConfirm } from '../Confirm'
import { Alert, KeyValue, KeyValues, send, useAction } from '../controls'
import type { NetworkPage } from '../NetworkPage'
import { Done, Module } from './Module'

const hostName = (host: string | undefined) => (host ? new URL(host).host : '')

// What saving or removing the key answers: the key as the settings show it, and today's usage, now
// read where the network's Qloo calls count.
type KeyChange = { key: OwnKey; usage: Usage }

// The settings' Qloo key module: the network's own Qloo key (ADR 0004). An owner picks the host it's
// for and pastes it; the gateway tests it with one search before it keeps it, and from then on it shows
// only its last four characters, with a way to remove it, back to Crossfeed's shared key, once the
// owner confirms. A member sees whether the network has one, not which. A guest, an owner as the guest
// account every guest shares (ADR 0008), is told every guest shares the key.
export function QlooKeyModule({
  network,
  qlooKey,
  guest = false,
  onChange
}: {
  network: NetworkPage
  qlooKey: OwnKey
  guest?: boolean
  onChange: (change: KeyChange) => void
}) {
  // Whether the key on show was saved on this page, to say it was tested.
  const [saved, setSaved] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  return (
    <Module
      id="set-qloo-h"
      title="Qloo key"
      heading={heading}
      help={`During the beta, a network’s Qloo calls run on Crossfeed’s shared key, within its daily caps. With a key of its own, ${network.name}’s calls and its launches’ run on that key, under its own agreement with Qloo, with a cache and Qloo caps of their own. Model runs count against Crossfeed’s caps either way.`}
    >
      {network.role !== 'owner' ? (
        <>
          <KeyValues>
            <KeyValue label="Qloo key">{qlooKey.set ? 'The network’s own' : 'Crossfeed’s shared key'}</KeyValue>
          </KeyValues>
          <p className="text-muted-foreground">Only an owner can add or remove the network’s Qloo key.</p>
        </>
      ) : qlooKey.set ? (
        <OwnKeyRecord
          network={network}
          qlooKey={qlooKey}
          saved={saved}
          heading={heading}
          onChange={(change) => {
            setSaved(false)
            onChange(change)
          }}
        />
      ) : (
        <AddKey
          network={network}
          onChange={(change) => {
            setSaved(true)
            onChange(change)
          }}
        />
      )}
      {network.role === 'owner' && guest && (
        <p className="text-muted-foreground">Every guest shares a key added here, and sees its last four characters.</p>
      )}
    </Module>
  )
}

function AddKey({ network, onChange }: { network: NetworkPage; onChange: (change: KeyChange) => void }) {
  const [host, setHost] = useState<string | null>(null)
  const [key, setKey] = useState('')
  const { busy, error, run } = useAction()
  const save = () =>
    run(async () => {
      onChange(await send<KeyChange>(`/app/${network.id}/settings/qloo-key`, { host, key }))
    })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <FieldGroup>
        <FieldSet>
          <FieldLegend id="qloo-host">Host</FieldLegend>
          <RadioGroup
            aria-labelledby="qloo-host"
            value={host}
            onValueChange={(next) => setHost(next as string)}
            disabled={busy}
            className="gap-0.5"
          >
            {QLOO_HOSTS.map((h) => (
              <label
                key={h.url}
                className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-card has-checked:bg-card max-md:min-h-11"
              >
                <RadioGroupItem value={h.url} className="mt-0.5" />
                <span className="flex min-w-0 flex-col">
                  <span>{h.name}</span>
                  <span className="type-caption text-muted-foreground">
                    {hostName(h.url)}
                    {h.note}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </FieldSet>
        <Field>
          <FieldLabel htmlFor="qloo-key">Key</FieldLabel>
          <Input
            type="password"
            id="qloo-key"
            className="max-w-sm"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
            // A password field, so the password managers that ignore autoComplete="off" there are told
            // by name not to offer, or save, the Qloo key as this site's login.
            data-1p-ignore=""
            data-lpignore="true"
            data-bwignore=""
            data-form-type="other"
            spellCheck={false}
            disabled={busy}
          />
        </Field>
      </FieldGroup>
      <div>
        <Button type="submit" variant="secondary" disabled={busy || !host || !key.trim()}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Testing…' : 'Test and save key'}
        </Button>
      </div>
      <Alert error={error} />
      <p className="text-muted-foreground">
        Crossfeed tries one search with it first and saves it only once Qloo answers, encrypted. From then on it shows
        only its last four characters.
      </p>
    </form>
  )
}

function OwnKeyRecord({
  network,
  qlooKey,
  saved,
  heading,
  onChange
}: {
  network: NetworkPage
  qlooKey: OwnKey
  saved: boolean
  heading: React.RefObject<HTMLHeadingElement | null>
  onChange: (change: KeyChange) => void
}) {
  const { confirm, dialog } = useConfirm(heading)
  const askRemove = () =>
    confirm({
      title: `Remove ${network.name}’s own Qloo key?`,
      consequence:
        'Its cache and today’s Qloo counts go with it, and its Qloo calls go back to Crossfeed’s shared key.',
      verb: 'Remove key',
      busy: 'Removing…',
      keep: 'Keep it',
      action: async () => onChange(await send<KeyChange>(`/app/${network.id}/settings/qloo-key/remove`))
    })
  return (
    <>
      <KeyValues>
        <KeyValue label="Key">
          Ends in <code className="font-mono">{qlooKey.last4}</code>
        </KeyValue>
        <KeyValue label="Host">{hostName(qlooKey.host)}</KeyValue>
      </KeyValues>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="destructive" onClick={askRemove}>
          Remove key
        </Button>
        <Done shown={saved}>Tested and saved.</Done>
      </div>
      <p className="text-muted-foreground">
        The network’s and its launches’ Qloo calls go with this key to its host. To use another key, remove this one and
        add the new one.
      </p>
      {dialog}
    </>
  )
}
