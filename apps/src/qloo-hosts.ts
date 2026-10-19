// The Qloo hosts a network's own key can be for (ADR 0004), shared by the gateway, which sends to them,
// and the settings page, which offers them: Qloo's production API, and the hackathon's, the only one a
// hackathon key works on (platform research).
export const QLOO_HOSTS = [
  { url: 'https://api.qloo.com', name: 'Qloo’s production API', note: '' },
  { url: 'https://hackathon.api.qloo.com', name: 'Qloo’s hackathon API', note: ', where hackathon keys work' }
]

// Whether `url` is one of them, exactly as the settings page sends it.
export const isQlooHost = (url: unknown) => QLOO_HOSTS.some((h) => h.url === url)
