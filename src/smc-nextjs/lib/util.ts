export function isUUID(s: string): boolean {
  return typeof s == "string" && s.length == 36; // todo: add full check.
}
