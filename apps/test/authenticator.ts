// A software authenticator: makes passkeys and signs challenges the way a browser's platform
// authenticator does, so tests run the real ceremonies against the Worker. Each passkey is an ES256
// key pair made with WebCrypto, registered with "none" attestation, discoverable (it keeps its user
// handle), and reports a signature counter of 0, as synced passkeys do.
import { isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers'
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON
} from '@simplewebauthn/server'

// The origin tests send from, as in test/session.ts.
const ORIGIN = 'https://crossfeed.test'
// ES256's COSE algorithm identifier.
const ES256 = -7
// authenticatorData flags: user present, user verified, attested credential data included.
const UP = 0x01
const UV = 0x04
const AT = 0x40

type Passkey = { id: Uint8Array<ArrayBuffer>; rpId: string; userHandle: string; keys: CryptoKeyPair }

export type Authenticator = {
  // Answers navigator.credentials.create() for `options`, as the browser would from `origin`.
  register: (options: PublicKeyCredentialCreationOptionsJSON, origin?: string) => Promise<RegistrationResponseJSON>
  // Answers navigator.credentials.get() for `options` with the first passkey it holds for their
  // relying party, as a discoverable passkey sign-in, which names none, lets it.
  authenticate: (options: PublicKeyCredentialRequestOptionsJSON, origin?: string) => Promise<AuthenticationResponseJSON>
}

// `userVerified: false` is an authenticator that can't verify the user, such as a security key
// without a PIN: it sets the user present flag only.
export function softwareAuthenticator({ userVerified = true } = {}): Authenticator {
  const passkeys: Passkey[] = []
  const flags = UP | (userVerified ? UV : 0)
  const bytes = (...parts: (Uint8Array | number[])[]) => Uint8Array.from(parts.flatMap((p) => [...p]))
  const sha256 = async (data: BufferSource) => new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  const clientData = (type: string, challenge: string, origin: string) =>
    new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
  const counter = [0, 0, 0, 0]

  return {
    async register(options, origin = ORIGIN) {
      if (!options.pubKeyCredParams.some((p) => p.alg === ES256)) throw new Error('The options offer no ES256.')
      const keys = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
        'sign',
        'verify'
      ])) as CryptoKeyPair
      const id = crypto.getRandomValues(new Uint8Array(16))
      passkeys.push({ id, rpId: options.rp.id!, userHandle: options.user.id, keys })
      // The public key as COSE: an EC2 key on P-256 for ES256, from the raw point 0x04 || x || y.
      const point = new Uint8Array((await crypto.subtle.exportKey('raw', keys.publicKey)) as ArrayBuffer)
      const cose = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [1, 2],
          [3, ES256],
          [-1, 1],
          [-2, point.slice(1, 33)],
          [-3, point.slice(33)]
        ])
      )
      const authData = bytes(
        await sha256(new TextEncoder().encode(options.rp.id!)),
        [flags | AT],
        counter,
        new Uint8Array(16), // AAGUID: none
        [id.length >> 8, id.length & 0xff],
        id,
        cose
      )
      const attestation = isoCBOR.encode(
        new Map<string, string | Uint8Array | Map<string, never>>([
          ['fmt', 'none'],
          ['attStmt', new Map<string, never>()],
          ['authData', authData]
        ])
      )
      const credentialId = isoBase64URL.fromBuffer(id)
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientData('webauthn.create', options.challenge, origin)),
          attestationObject: isoBase64URL.fromBuffer(attestation),
          transports: ['internal']
        },
        authenticatorAttachment: 'platform',
        clientExtensionResults: {}
      }
    },

    async authenticate(options, origin = ORIGIN) {
      const passkey = passkeys.find((p) => p.rpId === options.rpId)
      if (!passkey) throw new Error(`No passkey for ${options.rpId}.`)
      const authData = bytes(await sha256(new TextEncoder().encode(options.rpId!)), [flags], counter)
      const data = clientData('webauthn.get', options.challenge, origin)
      const raw = new Uint8Array(
        await crypto.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          passkey.keys.privateKey,
          bytes(authData, await sha256(data))
        )
      )
      const credentialId = isoBase64URL.fromBuffer(passkey.id)
      return {
        id: credentialId,
        rawId: credentialId,
        type: 'public-key',
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(data),
          authenticatorData: isoBase64URL.fromBuffer(authData),
          signature: isoBase64URL.fromBuffer(der(raw)),
          userHandle: passkey.userHandle
        },
        authenticatorAttachment: 'platform',
        clientExtensionResults: {}
      }
    }
  }
}

// WebCrypto signs ECDSA as r || s; WebAuthn sends it DER-encoded, as an ASN.1 SEQUENCE of two INTEGERs.
function der(raw: Uint8Array) {
  const integer = (n: Uint8Array) => {
    let start = 0
    while (start < n.length - 1 && n[start] === 0) start++
    const value = n[start] & 0x80 ? [0, ...n.slice(start)] : [...n.slice(start)]
    return [0x02, value.length, ...value]
  }
  const body = [...integer(raw.slice(0, 32)), ...integer(raw.slice(32))]
  return Uint8Array.from([0x30, body.length, ...body])
}
