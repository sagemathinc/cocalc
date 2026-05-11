/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Cryptographic utilities for the OAuth2 Provider.

import { createHash, randomBytes, timingSafeEqual } from "crypto";

/**
 * Generate a cryptographically random string suitable for use as
 * client secrets, authorization codes, and tokens.
 */
export function generateRandomToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * Hash a client secret using SHA-256 for storage.
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/**
 * Verify a client secret against its hash using timing-safe comparison.
 */
export function verifySecret(secret: string, hash: string): boolean {
  const computed = hashSecret(secret);
  if (computed.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

/**
 * Compute the S256 code challenge for PKCE.
 */
export function computeS256Challenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

/**
 * Verify a PKCE code verifier against a stored code challenge.
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string,
  method: string = "S256",
): boolean {
  if (method !== "S256") {
    // Only S256 is supported (plain is insecure)
    return false;
  }
  const computed = computeS256Challenge(codeVerifier);
  if (computed.length !== codeChallenge.length) return false;
  return timingSafeEqual(Buffer.from(computed), Buffer.from(codeChallenge));
}
