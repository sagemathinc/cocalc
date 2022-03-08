/* api call to get the supported SSO strategies, and additional metadata (e.g.,
icons) that make them easier to work with.

Returns array Strategy[], where Strategy is as defined in

       @cocalc/server/auth/sso/get-strategies

or {error:message} if something goes wrong.
*/

import getStrategies from "@cocalc/server/auth/sso/get-strategies";

export default async function handle(_req, res) {
  try {
    res.json(await getStrategies());
  } catch (err) {
    res.json({ error: err.message });
  }
}
