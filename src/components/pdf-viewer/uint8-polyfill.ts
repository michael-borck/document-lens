/**
 * Polyfills for Uint8Array hex methods used by pdfjs-dist v5.
 *
 * Uint8Array.prototype.toHex() and Uint8Array.fromHex() were added in
 * Chromium 137 / Node 22. Electron 33 ships Chromium 130, so without
 * these shims pdfjs throws "a.toHex is not a function" the moment it
 * tries to parse a PDF (font lookup, image stream, etc.).
 *
 * Implementations match the TC39 proposal:
 * https://tc39.es/proposal-arraybuffer-base64/spec/
 *
 * Drop this file when we move to an Electron version with Chromium 137+
 * (Electron 35.x).
 */

interface Uint8ArrayHexPolyfill {
  toHex(): string
}
interface Uint8ArrayConstructorHexPolyfill {
  fromHex(hex: string): Uint8Array
}

const proto = Uint8Array.prototype as Uint8Array & Uint8ArrayHexPolyfill
if (typeof proto.toHex !== 'function') {
  proto.toHex = function toHex(this: Uint8Array): string {
    let out = ''
    for (let i = 0; i < this.length; i++) {
      out += this[i].toString(16).padStart(2, '0')
    }
    return out
  }
}

const ctor = Uint8Array as Uint8ArrayConstructor & Uint8ArrayConstructorHexPolyfill
if (typeof ctor.fromHex !== 'function') {
  ctor.fromHex = function fromHex(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
      throw new SyntaxError('Uint8Array.fromHex: hex string must have even length')
    }
    const out = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      const byte = Number.parseInt(hex.slice(i, i + 2), 16)
      if (Number.isNaN(byte)) {
        throw new SyntaxError(`Uint8Array.fromHex: invalid hex byte at offset ${i}`)
      }
      out[i / 2] = byte
    }
    return out
  }
}
