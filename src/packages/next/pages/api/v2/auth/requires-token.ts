/* api call to see whether or not a token is required for creating an account. */

import getRequiresToken from "@cocalc/server/auth/tokens/get-requires-token";

export default async function handle(_req, res) {
  try {
    res.json(await getRequiresToken());
  } catch (err) {
    res.json({ error: err.message });
  }
}
