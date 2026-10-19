import { CrossfeedAgent } from './agent'
import { networkLimitKey } from './network-agent'

// One instance per launch of a signed-in network, named `<networkId>:<launchId>` (ADR 0001). Its own
// class keeps its namespace apart from the demo's sessions and the networks'. No route reaches it yet.
export class LaunchAgent extends CrossfeedAgent {
  // A launch's Qloo calls and model runs count among its network's (TRD agent limits).
  protected limitKey() {
    return networkLimitKey(this.name)
  }
}
