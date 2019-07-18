export function assert_never(x: never): never {
  throw new Error("Unexpected object: " + x);
}