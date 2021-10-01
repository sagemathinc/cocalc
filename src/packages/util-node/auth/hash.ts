import { createHmac } from "crypto";

// This function is private and burried inside the password-hash
// library.  To avoid having to fork/modify that library, we've just
// copied it here.  We need it for remember_me cookies.
export default function hash(
  algorithm: string,
  salt: string,
  iterations: number,
  password: string
): string {
  // there are cases where createHmac throws an error, because "salt" is undefined
  if (algorithm == null || salt == null) {
    throw new Error(
      `undefined arguments: algorithm='${algorithm}' salt='${salt}'`
    );
  }
  iterations = iterations || 1;
  if (!isFinite(iterations) || iterations > 10000) {
    // If somebody could make their own cookie, they might set the number of iterations
    // to be very large and hang the server.
    throw Error("number of iterations invalid or too large");
  }
  let hash = password;
  for (
    let i = 1, end = iterations, asc = 1 <= end;
    asc ? i <= end : i >= end;
    asc ? i++ : i--
  ) {
    hash = createHmac(algorithm, salt).update(hash).digest("hex");
  }
  return algorithm + "$" + salt + "$" + iterations + "$" + hash;
}
