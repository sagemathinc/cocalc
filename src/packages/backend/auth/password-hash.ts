import { generate, verify } from "password-hash";
import LRU from "lru-cache";

// We cache computation of the hash, since e.g., api keys have the
// hash computed for every single api call, and it's always the same key,
// so that's expensive.
const cache = new LRU<string, string>({
  max: 1000,
  ttl: 1000 * 60 * 5, // 5 minutes
});

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
  if (cache.has(password)) {
    return cache.get(password)!;
  }

  const hash = generate(password, {
    algorithm: HASH_ALGORITHM,
    saltLength: HASH_SALT_LENGTH,
    iterations: HASH_ITERATIONS,
  });
  cache.set(password, hash);
  return hash;
}

export { verify as verifyPassword };
