import { Badge } from '@/components/ui/badge'
import type { Usage } from '../../gateway'
import type { NetworkPage } from '../NetworkPage'
import { UsageLines, usageScope } from '../usage'
import { Module } from './Module'

// The settings' usage module: what the network has used today against the beta's daily caps, as the
// gateway counts them for the network whichever member or API key spends them, and when they reset, as
// the dashboard shows them too (usage.tsx). Every member sees it, so a refused run is never a surprise;
// in a network on the guest budget, it says every guest's use counts together, there and in the guest
// network (ADR 0006). `usage` is read as the page loads, and again as the network's own Qloo key comes
// or goes (`hasOwnKey`), since its Qloo calls count in its own gateway instance while it has one.
export function UsageModule({ network, usage, hasOwnKey }: { network: NetworkPage; usage: Usage; hasOwnKey: boolean }) {
  return (
    <Module id="set-usage-h" title="Usage" badge={<Badge>Beta</Badge>} description={`${usageScope(network)}.`}>
      <UsageLines usage={usage} hasOwnKey={hasOwnKey} />
      <p className="text-muted-foreground">Crossfeed’s caps across every network apply as well.</p>
    </Module>
  )
}
