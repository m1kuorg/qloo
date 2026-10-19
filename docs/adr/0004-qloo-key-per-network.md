# A network can bring its own Qloo key

Crossfeed's Qloo key is a personal hackathon key: it works only on the hackathon host, is switched off after judging, and Qloo's terms forbid sharing it or reselling access to the Services ([platform research](/docs/research/platform.md#qloo-key-terms)). So the free beta runs every network on that key, inside per-network daily caps, as the public demo already does, and an owner can add the network's own Qloo key in settings. A network with its own key gets its own gateway instance, with its key (encrypted with a Worker secret), its host, its cache, and its Qloo caps, so its Qloo data never mixes with another network's. Without one, it shares the global gateway and its cache. Model runs spend Crossfeed's Anthropic key either way, so their caps stay with the global gateway.

## Consequences

- When the hackathon key is switched off, networks without a key of their own can't run Qloo; the sample network replays its stored run.
- Selling Crossfeed, or opening it beyond the beta, needs a commercial Qloo agreement or each network's own key.
