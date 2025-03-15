### NOTES

- we are using sha1 hashes a lot because we have to store various data, e.g., arbitrary file paths, as nats segments, so MUST have a bounded size string with simple characters.
  The very low probability of a collision is discussed here: https://crypto.stackexchange.com/questions/2583/is-it-fair-to-assume-that-sha1-collisions-wont-occur-on-a-set-of-100k-strings
