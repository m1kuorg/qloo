// Who a visitor is for the per-visitor limits (TRD agent limits): a salted hash of their address,
// CF-Connecting-IP as Cloudflare's edge sets it. The address itself is never stored.
import { sha256 } from './text'

// The visitor tag for a request, or null without an address, as in local tests.
export async function visitorTag(request: Request, salt: string) {
  const ip = request.headers.get('CF-Connecting-IP')
  return ip ? `visitor:${await sha256(`${salt}:${network(ip)}`)}` : null
}

// A visitor's address as the limits count it: an IPv6 address by its /64, which one home or phone
// usually holds whole, so moving to another address inside it doesn't reset the count.
function network(ip: string) {
  if (!ip.includes(':') || ip.includes('.')) return ip // IPv4, or IPv4 written as IPv6
  const [head, tail] = ip.split('::')
  const groups = (part?: string) => (part ? part.split(':') : [])
  const zeros = tail === undefined ? [] : Array(8 - groups(head).length - groups(tail).length).fill('0')
  return [...groups(head), ...zeros, ...groups(tail)]
    .slice(0, 4)
    .map((g) => parseInt(g, 16).toString(16))
    .join(':')
}
