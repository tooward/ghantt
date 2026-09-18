/*
 * Copyright 2026 Mike Ward
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Encrypting the remembered token with a passkey (ARCHITECTURE.md §6, Tier 3).
 *
 * The WebAuthn `prf` extension derives a secret from a passkey. That secret
 * never exists in storage, and getting it back needs a fresh user-verification
 * gesture, so an XSS cannot silently exfiltrate the token — it would have to
 * trigger a biometric or PIN prompt the user can see.
 *
 * Two shapes of support matter and are different things:
 *   - `prf` at **creation** time reports only whether the authenticator can do
 *     it (`enabled`); many authenticators will not return a value there.
 *   - `prf` at **assertion** time is where the secret actually comes from.
 * So enrolment creates the credential, then immediately asserts once to derive
 * the key. Everything is feature-detected; a failure anywhere falls back to
 * session-only storage rather than degrading to plaintext at rest.
 */

const RP_NAME = 'gh-gantt'
const PRF_INFO = 'gh-gantt:token-encryption:v1'
const KEY_BYTES = 32
const IV_BYTES = 12

export interface EncryptedToken {
  /** Raw credential id, needed to ask for the same passkey again. */
  credentialId: Uint8Array
  /** Per-credential PRF input. Fixed for the life of the record. */
  salt: Uint8Array
  iv: Uint8Array
  ciphertext: Uint8Array
}

/** Why a passkey path was unavailable, for an honest message in the UI. */
export type PasskeyFailure = 'unsupported' | 'declined' | 'no-prf' | 'failed'

export class PasskeyError extends Error {
  readonly reason: PasskeyFailure

  constructor(reason: PasskeyFailure, message: string) {
    super(message)
    this.name = 'PasskeyError'
    this.reason = reason
  }
}

/**
 * Whether this browser could plausibly do passkey encryption. Real PRF support
 * depends on the authenticator too and is only known once one answers, so this
 * gates the offer, never the fallback.
 */
export async function isPasskeyEncryptionAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!window.PublicKeyCredential || !navigator.credentials?.create) return false
  if (!globalThis.crypto?.subtle) return false

  try {
    const capabilities = await window.PublicKeyCredential.getClientCapabilities?.()
    // A client that reports capabilities and omits PRF genuinely lacks it.
    if (capabilities && 'extension:prf' in capabilities) {
      return capabilities['extension:prf'] === true
    }
  } catch {
    // Older clients have no getClientCapabilities; fall through to optimism.
  }

  return true
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * Turn PRF output into an AES-GCM key. HKDF binds the key to this app's
 * purpose, so the same passkey used elsewhere yields a different key.
 */
async function keyFromPrf(prfOutput: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', prfOutput as BufferSource, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: new TextEncoder().encode(PRF_INFO),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Copy any BufferSource into bytes we own.
 *
 * Deliberately not `instanceof ArrayBuffer`: a buffer handed over by the
 * WebAuthn or WebCrypto implementation can come from a different realm, where
 * `instanceof` is false even though the value is a perfectly good ArrayBuffer.
 * `ArrayBuffer.isView` and the `Uint8Array` constructor both look at internal
 * slots instead, so they work across realms.
 */
function toBytes(source: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength).slice()
  }
  return new Uint8Array(source as ArrayBufferLike).slice()
}

function prfResult(credential: PublicKeyCredential): Uint8Array {
  const first = credential.getClientExtensionResults().prf?.results?.first
  if (!first) {
    throw new PasskeyError('no-prf', 'This passkey cannot derive an encryption key (no PRF result).')
  }
  const bytes = toBytes(first)
  if (bytes.byteLength === 0) {
    throw new PasskeyError('no-prf', 'This passkey returned an empty PRF result.')
  }
  return bytes
}

function asPasskeyError(cause: unknown, fallback: PasskeyFailure): PasskeyError {
  if (cause instanceof PasskeyError) return cause
  const name = cause instanceof Error ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return new PasskeyError('declined', 'The passkey prompt was dismissed.')
  }
  if (name === 'NotSupportedError') {
    return new PasskeyError('unsupported', 'This device cannot create a suitable passkey.')
  }
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new PasskeyError(fallback, `Passkey encryption failed: ${detail}`)
}

/** Assert against a known credential and derive its key. Prompts the user. */
async function deriveKey(credentialId: Uint8Array, salt: Uint8Array): Promise<CryptoKey> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32) as BufferSource,
      allowCredentials: [{ id: credentialId as BufferSource, type: 'public-key' }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: salt as BufferSource } } },
    },
  })) as PublicKeyCredential | null

  if (!assertion) throw new PasskeyError('declined', 'No passkey was provided.')
  return keyFromPrf(prfResult(assertion), salt)
}

/**
 * Create a passkey and encrypt the token with a key derived from it. Costs the
 * user two prompts: one to create the credential, one to derive the key.
 */
export async function encryptWithNewPasskey(token: string, label: string): Promise<EncryptedToken> {
  if (!(await isPasskeyEncryptionAvailable())) {
    throw new PasskeyError('unsupported', 'This browser cannot encrypt with a passkey.')
  }

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        rp: { name: RP_NAME },
        // Not an account: the passkey exists only to hold an encryption secret.
        user: { id: randomBytes(16) as BufferSource, name: label || 'gh-gantt token', displayName: label || 'gh-gantt token' },
        challenge: randomBytes(32) as BufferSource,
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        extensions: { prf: {} },
      },
    })) as PublicKeyCredential | null

    if (!credential) throw new PasskeyError('declined', 'Passkey creation was cancelled.')
    if (credential.getClientExtensionResults().prf?.enabled === false) {
      throw new PasskeyError('no-prf', 'This authenticator does not support the PRF extension.')
    }

    const credentialId = toBytes(credential.rawId)
    const salt = randomBytes(KEY_BYTES)
    const key = await deriveKey(credentialId, salt)
    const iv = randomBytes(IV_BYTES)
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(token) as BufferSource,
    )

    return { credentialId, salt, iv, ciphertext: toBytes(ciphertext) }
  } catch (cause) {
    throw asPasskeyError(cause, 'failed')
  }
}

/** Prompt for the passkey behind this record and decrypt the token. */
export async function decryptWithPasskey(record: EncryptedToken): Promise<string> {
  try {
    const key = await deriveKey(record.credentialId, record.salt)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: record.iv as BufferSource },
      key,
      record.ciphertext as BufferSource,
    )
    return new TextDecoder().decode(plaintext)
  } catch (cause) {
    throw asPasskeyError(cause, 'failed')
  }
}
