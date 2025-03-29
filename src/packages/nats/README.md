### NOTES

- We are using base64 encoding of keys because w

- We have to store various data, e.g., arbitrary file paths, as nats segments, so MUST have a string with allowed characters.  

  - NATS officially allows: "Any Unicode character except null, space, ., * and >"
    See https://docs.nats.io/nats-concepts/subjects#characters-allowed-and-recommended-for-subject-names
  - However, the nats kv javascript client uses an incredibly restrictive key checker, which doesn't even allow base64 encoding! Geez: https://github.com/nats-io/nats.js/issues/246
  
  