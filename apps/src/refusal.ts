// A refusal a program must tell apart from others: an error with a stable code beside the message a
// person reads. The agents throw it from their actions, the operations module from its own checks,
// and the API answers it with the code's HTTP status. The code is an own property, which workerd
// keeps on an error thrown across Durable Object RPC, so a caller reads it there without parsing the
// message. A page reads only the message, as it does any other error.

// Each code and the HTTP status the REST API answers it with.
export const REFUSALS = {
  invalid: 400, // the request, or a value in it, can't be used as it is
  unauthorized: 401, // no API key or session, or one that's unknown, revoked, or expired
  forbidden: 403, // the caller can't do this, such as a member changing what only an owner does
  not_found: 404, // no such resource, or none the caller can see
  conflict: 409, // the resource's state refuses it, such as an import over a roster without `replace`
  too_large: 413, // an upload over the size limit
  unreadable: 422, // an upload that can't be read, such as a CSV with no `name` column
  limit: 429, // a daily cap, of the network or of all of Crossfeed
  rate_limited: 429 // too many requests a minute with one API key, or from one visitor
} as const

export type RefusalCode = keyof typeof REFUSALS

export class Refusal extends Error {
  constructor(
    readonly code: RefusalCode,
    message: string
  ) {
    super(message)
    this.name = 'Refusal'
  }
}

// An error's refusal code, thrown here or across RPC; null for any other error.
export function refusalCode(error: unknown): RefusalCode | null {
  const code = (error as { code?: unknown } | null)?.code
  return typeof code === 'string' && Object.hasOwn(REFUSALS, code) ? (code as RefusalCode) : null
}
