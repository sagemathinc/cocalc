/*
Get the profile for an account.
This is public information if user the user knows
the account_id.  It is the color, the name, and
the image.
*/

import getProfile from "@cocalc/backend/accounts/profile/get";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request" });
    return;
  }

  const { account_id } = req.body;
  try {
    res.json({ profile: await getProfile(account_id) });
  } catch (err) {
    res.json({ error: `${err}` });
  }
}
