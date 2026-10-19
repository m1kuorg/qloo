import { CrossfeedAgent } from './agent'

// One instance per launch of a signed-in network, named `<networkId>:<launchId>` (ADR 0001). Its own
// class keeps its namespace apart from the demo's sessions and the networks'. No route reaches it yet.
export class LaunchAgent extends CrossfeedAgent {}
