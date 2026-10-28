import { Button } from '@/components/ui/button'
import { GUEST_NETWORK_CLEARS } from '../../text'
import { useConfirm } from '../Confirm'
import { send } from '../controls'
import type { NetworkPage } from '../NetworkPage'
import { Module } from './Module'

// The settings' sample data module, in the guest network alone, where the sample lives (ADR 0007): an
// owner, as every guest is (ADR 0008), resets it to the sample data now, for every guest, as the daily
// clearing does. It asks first, since it changes the network for everyone; once it's done, the owner who
// reset it opens the fresh dashboard, which says so if part of the reset is left to the hourly retry. Its
// reset closes this page's connection too, as it does every guest's, so `onLeaving` keeps the page as it
// is while the reset is out (NetworkGate). A refusal stays in the dialog. A member sees only whose it is
// to do.
export function SampleDataModule({
  network,
  onLeaving
}: {
  network: NetworkPage
  onLeaving: (leaving: boolean) => void
}) {
  const inbox = network.links.inbox !== null
  const { confirm, dialog } = useConfirm()
  const askReset = () =>
    confirm({
      title: 'Reset the sample data?',
      consequence: `Every guest’s changes to ${network.name} go: its launches, with their runs and insertion orders, its roster${inbox ? ' and inbox' : ''}, its name and CPM, and a Qloo key added here. It opens again with the sample data, and every guest’s open pages of it close. Its API keys, invite links, and members stay, and so do networks guests created, until ${GUEST_NETWORK_CLEARS}.`,
      verb: 'Reset',
      busy: 'Resetting…',
      keep: 'Keep',
      action: async () => {
        onLeaving(true)
        const { pending } = await send<{ pending?: boolean }>(`/app/${network.id}/settings/sample-data/reset`).catch(
          (e) => {
            onLeaving(false)
            throw e
          }
        )
        window.location.assign(`/app/${network.id}${pending ? '?reset=pending' : ''}`)
      }
    })
  return (
    <Module
      id="set-sample-h"
      title="Sample data"
      help={`The guest network starts every day at ${GUEST_NETWORK_CLEARS} from the sample data: The Ringer’s shows, the sample CPM, The Watch and the sample launches${inbox ? ', and the sample inbox' : ''}. Reset it to start over now, for every guest.`}
    >
      {network.role === 'owner' ? (
        <>
          <div>
            <Button variant="destructive" onClick={askReset}>
              Reset the sample data
            </Button>
          </div>
          <p className="text-muted-foreground">
            Resetting closes every guest’s open pages of the guest network. Every guest shares a few resets a day, and
            after one, the next may wait up to an hour.
          </p>
          {dialog}
        </>
      ) : (
        <p className="text-muted-foreground">Only an owner can reset the sample data.</p>
      )}
    </Module>
  )
}
