import { useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { Invite, NetworkMember } from '../../directory'
import { GUEST_MEMBER } from '../../text'
import { useConfirm } from '../Confirm'
import { Alert, day, ScrollTable, send, ShownOnce, useAction } from '../controls'
import type { NetworkPage } from '../NetworkPage'
import { StateLine } from '../states'
import { cell, head, Module } from './Module'

// The settings' members module: who's in the network, with their role and when they joined, and, for an
// owner, its invite links. An owner changes roles, removes members, and makes and revokes links; any
// member can leave. No change may leave the network without an owner: the Worker refuses one, and the
// module doesn't offer it. Nor does it offer a guest, signed in as the guest member every guest shares, a
// change to that member's own membership, which the Worker refuses too (ADR 0008). `invites` is null for a
// member, who doesn't see them. Removing, leaving, revoking, and making an owner a member, which revokes
// their keys and links, each confirm first.
export function MembersModule({
  network,
  memberId,
  members: listed,
  invites
}: {
  network: NetworkPage
  memberId: string
  members: NetworkMember[]
  invites: Invite[] | null
}) {
  const [members, setMembers] = useState(listed)
  const { busy, error, run } = useAction()
  const heading = useRef<HTMLHeadingElement>(null)
  const { confirm, dialog } = useConfirm(heading)
  const owner = network.role === 'owner'
  // Whether the network has one owner, whom it can't lose.
  const oneOwner = members.filter((m) => m.role === 'owner').length === 1
  const me = members.find((m) => m.id === memberId)
  const guest = memberId === GUEST_MEMBER
  const lastOwner = me?.role === 'owner' && oneOwner && !guest
  const path = `/app/${network.id}/settings/members`

  const changeRole = async (m: NetworkMember) => {
    const answer = await send<{ members: NetworkMember[] }>(`${path}/${m.id}/role`, {
      role: m.role === 'owner' ? 'member' : 'owner'
    })
    // An owner who made themselves a member reloads, to see settings as a member does.
    if (m.id === memberId) return window.location.reload()
    setMembers(answer.members)
  }
  // Making an owner a member revokes what they made, so it asks first; making someone an owner doesn't.
  const setRole = (m: NetworkMember) => {
    if (m.role !== 'owner') return void run(() => changeRole(m))
    const self = m.id === memberId
    confirm({
      title: self ? `Make yourself a member of ${network.name}?` : `Make ${m.name} a member?`,
      consequence: self
        ? 'The API keys and invite links you made are revoked at once, and only an owner can make you an owner again.'
        : 'The API keys and invite links they made are revoked at once, and only an owner can make them an owner again.',
      verb: 'Make member',
      busy: 'Changing…',
      keep: 'Keep',
      action: () => changeRole(m)
    })
  }
  const askOut = (m: NetworkMember) => {
    const self = m.id === memberId
    const made = m.role === 'owner'
    confirm(
      self
        ? {
            title: `Leave ${network.name}?`,
            consequence: `Your open pages close${made ? ', the API keys and invite links you made are revoked' : ''}, and you’ll need a new invite to come back.`,
            verb: 'Leave',
            busy: 'Leaving…',
            keep: 'Stay',
            action: async () => {
              await send(`${path}/leave`)
              window.location.assign('/app')
            }
          }
        : {
            title: `Remove ${m.name} from ${network.name}?`,
            consequence: `Their open pages close at once${made ? ', the API keys and invite links they made are revoked' : ''}, and they’ll need a new invite to come back.`,
            verb: 'Remove',
            busy: 'Removing…',
            keep: 'Keep',
            action: async () => setMembers((await send<{ members: NetworkMember[] }>(`${path}/${m.id}/remove`)).members)
          }
    )
  }

  return (
    <>
      <Module
        id="set-members-h"
        title="Members"
        heading={heading}
        description={`Everyone who can open ${network.name}.`}
      >
        <ScrollTable label="Members table">
          <table className="relative w-full min-w-[20rem] border-separate border-spacing-0">
            <thead className="type-caption text-muted-foreground">
              <tr>
                <th scope="col" className={head}>
                  Member
                </th>
                <th scope="col" className={head}>
                  Role
                </th>
                <th scope="col" className={head}>
                  Joined
                </th>
                <th scope="col" className={head}>
                  <span className="vh">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.id === memberId
                // A network keeps at least one owner, so its last one has no "Make member", and a guest's own
                // row has neither it nor Leave.
                const canSetRole = owner && !(m.role === 'owner' && oneOwner) && !(self && guest)
                return (
                  <tr key={m.id}>
                    <th scope="row" className={`${cell} text-left font-medium`}>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {m.name}
                        {self && <Badge variant="outline">You</Badge>}
                      </span>
                    </th>
                    <td className={`${cell} whitespace-nowrap`}>{m.role === 'owner' ? 'Owner' : 'Member'}</td>
                    <td className={`${cell} whitespace-nowrap text-muted-foreground`}>{day(m.joined)}</td>
                    <td className={`${cell} pr-0 text-right`}>
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {canSetRole && (
                          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRole(m)}>
                            {m.role === 'owner' ? 'Make member' : 'Make owner'}
                          </Button>
                        )}
                        {(self ? !guest : owner) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy || (self && lastOwner)}
                            onClick={() => askOut(m)}
                          >
                            {self ? 'Leave' : 'Remove'}
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollTable>
        <Alert error={error} />
        {lastOwner && members.length > 1 && (
          <p className="text-muted-foreground">You’re the only owner. Make someone else an owner before you leave.</p>
        )}
        {lastOwner && members.length === 1 && (
          <p className="text-muted-foreground">A network needs an owner, so its only one can’t leave.</p>
        )}
        {guest && me && (
          <p className="text-muted-foreground">
            You’re signed in as Guest, the account every guest shares, so you can’t leave or change its role.
          </p>
        )}
        {!owner && (
          <p className="text-muted-foreground">Only an owner can invite people, change roles, or remove members.</p>
        )}
        {dialog}
      </Module>
      {invites && <InviteLinks path={path} invites={invites} />}
    </>
  )
}

// An owner's invite links, a module of their own beside the members: making one shows it once, to copy;
// the list shows each one still open by its dates, to revoke.
function InviteLinks({ path, invites: listed }: { path: string; invites: Invite[] }) {
  const [invites, setInvites] = useState(listed)
  const [made, setMade] = useState<{ id: string; link: string } | null>(null)
  const { busy, error, run, clear } = useAction()
  const heading = useRef<HTMLHeadingElement>(null)
  const { confirm, dialog } = useConfirm(heading)
  const create = async () => {
    const created = await run(async () => {
      const answer = await send<{ id: string; link: string; invites: Invite[] }>(`${path}/invites`)
      setMade({ id: answer.id, link: answer.link })
      setInvites(answer.invites)
    })
    // A refusal, or a request that failed, stops showing the link made before, so the refusal doesn't
    // read as if this link was made. A success has already replaced it.
    if (!created) setMade(null)
  }
  const askRevoke = (i: Invite) =>
    confirm({
      title: `Revoke the invite link made ${day(i.created)}${i.by ? ` by ${i.by}` : ''}?`,
      consequence: 'It stops working at once: whoever opens it is told it was revoked, and needs a new one to join.',
      verb: 'Revoke',
      busy: 'Revoking…',
      keep: 'Keep',
      action: async () => {
        setInvites((await send<{ invites: Invite[] }>(`${path}/invites/${i.id}/revoke`)).invites)
        setMade((m) => (m?.id === i.id ? null : m))
        // A refusal shown from creating one no longer describes the list. A failed revoke shows its
        // own refusal in the confirm.
        clear()
      }
    })
  return (
    <Module
      id="set-invites-h"
      title="Invite links"
      heading={heading}
      description="Each link lets one person join as a member, with a new account or the one they have, and works once, for seven days."
    >
      <div>
        <Button variant="secondary" disabled={busy} onClick={() => void create()}>
          {busy && <Spinner data-icon="inline-start" />}
          {busy ? 'Working…' : 'Create invite link'}
        </Button>
      </div>
      {made && (
        <ShownOnce key={made.id} id="invite-link" label="New invite link" noun="link" value={made.link} mono>
          Copy it now and send it to your teammate: Crossfeed shows each link only once.
        </ShownOnce>
      )}
      <Alert error={error} />
      {invites.length === 0 ? (
        <p>
          <StateLine kind="empty">No open invite links.</StateLine>
        </p>
      ) : (
        <ul className="flex flex-col gap-1" aria-label="Open invite links">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 rounded-lg bg-card py-1 pr-1 pl-3">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                {/* As wide as its words, so a member's name with no spaces breaks anywhere. */}
                <span className="wrap-anywhere">
                  Made {day(i.created)}
                  {i.by && ` by ${i.by}`}
                </span>
                {made?.id === i.id && <Badge variant="outline">New</Badge>}
                <span className="type-caption text-muted-foreground">Expires {day(i.expires)}</span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => askRevoke(i)}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      {dialog}
    </Module>
  )
}
