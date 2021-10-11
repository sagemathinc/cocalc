import { generate, verify } from "password-hash";

// You can change the parameters at any time and no existing passwords
// or cookies should break.  This will only impact newly created
// passwords and cookies.  Old ones can be read just fine (with the old
// parameters).
const HASH_ALGORITHM = "sha512";
const HASH_ITERATIONS = 1000;
const HASH_SALT_LENGTH = 32;

export default function passwordHash(password: string): string {
  // This blocks the server for around 5ms.
  // There are newer async libraries as explained at https://www.npmjs.com/package/password-hash
  // that do NOT block, which maybe we should be using instead....

  return generate(password, {
    algorithm: HASH_ALGORITHM,
    saltLength: HASH_SALT_LENGTH,
    iterations: HASH_ITERATIONS,
  });
}

export { verify as verifyPassword };
