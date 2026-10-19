import { CrossfeedAgent } from './agent'

// One instance per signed-in network, named by the network's ID (ADR 0001). Its own class keeps its
// namespace apart from the demo's sessions, so no session cookie can name it. No route reaches it yet.
export class NetworkAgent extends CrossfeedAgent {}
