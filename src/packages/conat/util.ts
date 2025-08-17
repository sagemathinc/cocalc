import jsonStableStringify from "json-stable-stringify";
import { encode as encodeBase64, decode as decodeBase64 } from "js-base64";
export { encodeBase64, decodeBase64 };
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export class ConatError extends Error {
  code?: string | number;
  subject?: string;
  constructor(
    mesg: string,
    { code, subject }: { code?: string | number; subject?: string } = {},
  ) {
    super(mesg);
    this.code = code;
    this.subject = subject;
  }
}

export function headerToError(headers): ConatError {
  const err = Error(headers.error);
  if (headers.error_attrs) {
    for (const field in headers.error_attrs) {
      err[field] = headers.error_attrs[field];
    }
  }
  if (err["code"] === undefined && headers.code) {
    err["code"] = headers.code;
  }
  return err;
}

export function handleErrorMessage(mesg) {
  if (mesg?.error) {
    if (mesg.error.startsWith("Error: ")) {
      throw Error(mesg.error.slice("Error: ".length));
    } else {
      throw Error(mesg.error);
    }
  }
  return mesg;
}

// Returns true if the subject matches the NATS pattern.
export function matchesPattern({
  pattern,
  subject,
}: {
  pattern: string;
  subject: string;
}): boolean {
  const subParts = subject.split(".");
  const patParts = pattern.split(".");
  let i = 0,
    j = 0;
  while (i < subParts.length && j < patParts.length) {
    if (patParts[j] === ">") return true;
    if (patParts[j] !== "*" && patParts[j] !== subParts[i]) return false;
    i++;
    j++;
  }

  return i === subParts.length && j === patParts.length;
}

// Return true if the subject is a valid NATS subject.
// Returns true if the subject is a valid NATS subject (UTF-8 aware)
export function isValidSubject(subject: string): boolean {
  if (typeof subject !== "string" || subject.length === 0) return false;
  if (subject.startsWith(".") || subject.endsWith(".")) return false;
  const tokens = subject.split(".");
  // No empty tokens
  if (tokens.some((t) => t.length === 0)) return false;
  for (let i = 0; i < tokens.length; ++i) {
    const tok = tokens[i];
    // ">" is only allowed as last token
    if (tok === ">" && i !== tokens.length - 1) return false;
    // "*" and ">" are allowed as sole tokens
    if (tok !== "*" && tok !== ">") {
      // Must not contain "." or any whitespace Unicode code point
      if (/[.\s]/u.test(tok)) {
        return false;
      }
    }
    // All tokens: must not contain whitespace (unicode aware)
    if (/\s/u.test(tok)) {
      return false;
    }
    // Allow any UTF-8 (unicode) chars except dot and whitespace in tokens.
  }
  return true;
}

export function isValidSubjectWithoutWildcards(subject: string): boolean {
  return (
    isValidSubject(subject) && !subject.includes("*") && !subject.endsWith(">")
  );
}

export function toKey(x): string | undefined {
  if (x === undefined) {
    return undefined;
  } else if (typeof x === "object") {
    return jsonStableStringify(x);
  } else {
    return `${x}`;
  }
}

// Returns the max payload size for messages for the NATS server
// that we are connected to.  This is used for chunking by the kv
// and stream to support arbitrarily large values.
export const getMaxPayload = reuseInFlight(async () => {
  // [ ] TODO
  return 1e6;
});

export const waitUntilConnected = reuseInFlight(async () => {});
