### NOTES

- We are using base64 encoding of keys because we want to allow arbitrary kesy but nats can't. NOTE: at one point this code used sha1 hashes for keys, but we switche to base64 because: (1) base64 is smaller for shorter keys and many keys are short, (2) computing base64 of a string is MUCH faster than computing sha1, (3) this completely eliminates any worry about hash collisions, and (4) it was easy to patch Nats to allow any base64 string (see below).

- We have to store various data, e.g., arbitrary file paths, as nats segments, so MUST have a string with allowed characters.

  - NATS officially allows: "Any Unicode character except null, space, ., \* and >"
    See https://docs.nats.io/nats-concepts/subjects#characters-allowed-and-recommended-for-subject-names
  - However, the nats kv javascript client uses an incredibly restrictive key checker, which doesn't even allow base64 encoding! Geez: https://github.com/nats-io/nats.js/issues/246
