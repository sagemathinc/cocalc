import {
  computeS256Challenge,
  generateRandomToken,
  hashSecret,
  verifyCodeChallenge,
  verifySecret,
} from "./crypto";

describe("generateRandomToken", () => {
  it("produces hex strings of the right length", () => {
    expect(generateRandomToken(16)).toHaveLength(32); // 16 bytes = 32 hex chars
    expect(generateRandomToken(32)).toHaveLength(64);
    expect(generateRandomToken(48)).toHaveLength(96);
  });

  it("produces unique values", () => {
    const a = generateRandomToken();
    const b = generateRandomToken();
    expect(a).not.toBe(b);
  });
});

describe("hashSecret / verifySecret", () => {
  it("verifies a correct secret", () => {
    const secret = "my-client-secret";
    const hash = hashSecret(secret);
    expect(verifySecret(secret, hash)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    const hash = hashSecret("correct-secret");
    expect(verifySecret("wrong-secret", hash)).toBe(false);
  });

  it("hash is a 64-char hex string (SHA-256)", () => {
    expect(hashSecret("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("PKCE S256", () => {
  it("verifyCodeChallenge accepts correct verifier", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = computeS256Challenge(verifier);
    expect(verifyCodeChallenge(verifier, challenge, "S256")).toBe(true);
  });

  it("verifyCodeChallenge rejects wrong verifier", () => {
    const challenge = computeS256Challenge("correct-verifier");
    expect(verifyCodeChallenge("wrong-verifier", challenge, "S256")).toBe(
      false,
    );
  });

  it("plain method is rejected (only S256 supported)", () => {
    const verifier = "plain-text-verifier";
    expect(verifyCodeChallenge(verifier, verifier, "plain")).toBe(false);
  });

  it("unknown method returns false", () => {
    expect(verifyCodeChallenge("a", "a", "unknown")).toBe(false);
  });
});
