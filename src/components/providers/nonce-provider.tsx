"use client";

import { setNonce } from "get-nonce";

/**
 * Radix Dialog → react-remove-scroll injects a <style> tag at runtime; get-nonce hands it the
 * per-request CSP nonce so the strict style-src policy does not block it.
 */
export function NonceProvider({ nonce }: { nonce: string | undefined }) {
  if (typeof window !== "undefined" && nonce) setNonce(nonce);
  return null;
}
