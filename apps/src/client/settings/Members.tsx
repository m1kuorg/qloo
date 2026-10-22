import { Fragment, useState } from 'react'
import type { Invite, NetworkMember } from '../../directory'
import { Alert, day, ScrollTable, send, ShownOnce, useAction } from '../controls'
import type { NetworkPage } from '../NetworkPage'
import { StateLine } from '../states'

// The settings' members module: who's in the network, with their role and when they joined, and, for
// an owner, its invite links. An owner changes roles, removes members, and makes and revokes links;
// any member can leave. No change may leave the network without an owner: the Worker refuses one, and
// the module doesn't offer it. `invites` is null for a member, who doesn't see them.
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
  // The member whose removal, or the member's own leaving, waits on a yes.
  const [asking, setAsking] = useState<string | null>(null)
  const { busy, error, run } = useAction()
  const owner = network.role === 'owner'
  const ownerCount = members.filter((m) => m.role === 'owner').length
  const me = members.find((m) => m.id === memberId)
  const lastOwner = me?.role === 'owner' && ownerCount === 1
  const path = `/app/${network.id}/settings/members`

  const setRole = (m: NetworkMember) =>
    run(async () => {
      const answer = await send<{ members: NetworkMember[] }>(`${path}/${m.id}/role`, {
        role: m.role === 'owner' ? 'member' : 'owner'
      })
      // An owner who made themselves a member reloads, to see settings as a member does.
      if (m.id === memberId) return window.location.reload()
      setMembers(answer.members)
    })
  const remove = (m: NetworkMember) =>
    run(async () => {
      if (m.id === memberId) {
        await send(`${path}/leave`)
        return window.location.assign('/app')
      }
      setMembers((await send<{ members: NetworkMember[] }>(`${path}/${m.id}/remove`)).members)
      setAsking(null)
    })

  return (
    <section className="mod set-mod" aria-labelledby="set-members-h">
      <div className="set-about">
        <h2 className="lbl" id="set-members-h">
          Members
        </h2>
        <p className="help">
          Everyone who can open {network.name}. Owners invite people, change roles, and remove members; members work on
          the roster, launches, and inbox. An owner who leaves, is removed, or is made a member loses the API keys and
          invite links they made: each is revoked at once.
        </p>
      </div>
      <div className="set-body wide">
        <ScrollTable label="Members table">
          <table className="chart members">
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Role</th>
                <th scope="col">Joined</th>
                <th scope="col">
                  <span className="vh">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const self = m.id === memberId
                const out = outWords(self, m.name, network.name, m.role === 'owner')
                // A network keeps at least one owner, so its last one has no "Make member".
                const canSetRole = owner && !(m.role === 'owner' && ownerCount === 1)
                return (
                  <Fragment key={m.id}>
                    <tr className={asking === m.id ? 'on' : undefined}>
                      <td className="nm">
                        {m.name}
                        {self && <span className="chip">You</span>}
                      </td>
                      <td>{m.role === 'owner' ? 'Owner' : 'Member'}</td>
                      <td className="tg">{day(m.joined)}</td>
                      <td className="r">
                        <span className="row-acts">
                          {canSetRole && (
                            <button className="lnk" type="button" disabled={busy} onClick={() => void setRole(m)}>
                              {m.role === 'owner' ? 'Make member' : 'Make owner'}
                            </button>
                          )}
                          {(self || owner) && (
                            <button
                              className="lnk"
                              type="button"
                              disabled={busy || (self && lastOwner)}
                              aria-expanded={asking === m.id}
                              onClick={() => setAsking(asking === m.id ? null : m.id)}
                            >
                              {out.act}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {asking === m.id && (
                      <tr className="on ask">
                        <td colSpan={4}>
                          <p>{out.ask}</p>
                          <div className="acts">
                            <button className="btn pri" type="button" disabled={busy} onClick={() => void remove(m)}>
                              {busy ? out.busy : out.act}
                            </button>
                            <button className="lnk" type="button" onClick={() => setAsking(null)}>
                              {out.back}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </ScrollTable>
        <Alert error={error} />
        {lastOwner && members.length > 1 && (
          <p className="help">You’re the only owner. Make someone else an owner before you leave.</p>
        )}
        {lastOwner && members.length === 1 && (
          <p className="help">A network needs an owner, so its only one can’t leave.</p>
        )}
        {!owner && <p className="help">Only an owner can invite people, change roles, or remove members.</p>}
        {invites && <InviteLinks path={path} invites={invites} />}
      </div>
    </section>
  )
}

// Taking a member out, in words: the member leaving, or an owner removing someone else. An owner's API
// keys and invite links go with them.
const outWords = (self: boolean, member: string, network: string, owner: boolean) =>
  self
    ? {
        act: 'Leave',
        busy: 'Leaving…',
        back: 'Stay',
        ask: `Leave ${network}? Your open pages close${owner ? ', the API keys and invite links you made are revoked' : ''}, and you’ll need a new invite to come back.`
      }
    : {
        act: 'Remove',
        busy: 'Removing…',
        back: 'Keep',
        ask: `Remove ${member} from ${network}? Their open pages close at once${owner ? ', the API keys and invite links they made are revoked' : ''}, and they’ll need a new invite to come back.`
      }

// An owner's invite links: making one shows it once, to copy; the list shows each one still open by
// its dates, to revoke.
function InviteLinks({ path, invites: listed }: { path: string; invites: Invite[] }) {
  const [invites, setInvites] = useState(listed)
  const [made, setMade] = useState<{ id: string; link: string } | null>(null)
  const { busy, error, run } = useAction()
  const create = () =>
    run(async () => {
      const answer = await send<{ id: string; link: string; invites: Invite[] }>(`${path}/invites`)
      setMade({ id: answer.id, link: answer.link })
      setInvites(answer.invites)
    })
  const revoke = (id: string) =>
    run(async () => {
      setInvites((await send<{ invites: Invite[] }>(`${path}/invites/${id}/revoke`)).invites)
      if (made?.id === id) setMade(null)
    })
  return (
    <div className="invites">
      <h3 className="lbl">Invite links</h3>
      <p className="help">
        Each link lets one person join as a member, with a new account or the one they have. It works once, for seven
        days.
      </p>
      <div className="acts">
        <button className="btn pri" type="button" disabled={busy} onClick={() => void create()}>
          {busy ? 'Working…' : 'Create invite link'}
        </button>
      </div>
      {made && (
        <ShownOnce key={made.id} id="invite-link" label="New invite link" noun="link" value={made.link}>
          Copy it now and send it to your teammate: Crossfeed shows each link only once.
        </ShownOnce>
      )}
      <Alert error={error} />
      {invites.length === 0 ? (
        <StateLine kind="empty">No open invite links.</StateLine>
      ) : (
        <ul className="invite-list" aria-label="Open invite links">
          {invites.map((i) => (
            <li key={i.id}>
              <span>
                Made {day(i.created)}
                {i.by && ` by ${i.by}`}
                {made?.id === i.id && <span className="chip">New</span>}
                <span className="tg">Expires {day(i.expires)}</span>
              </span>
              <button className="lnk" type="button" disabled={busy} onClick={() => void revoke(i.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
