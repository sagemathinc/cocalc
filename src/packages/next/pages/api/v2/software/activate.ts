import getParams from "lib/api/get-params";

import {
  activateLicenseOnLaunchpad,
  activateLicenseOnServer,
  isLaunchpadMode,
} from "@cocalc/server/software-licenses/activation";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }
  try {
    const { token, instance_id } = getParams(req);
    if (!token) {
      res.status(400).json({ error: "missing token" });
      return;
    }
    const result = isLaunchpadMode()
      ? await activateLicenseOnLaunchpad({ token })
      : await activateLicenseOnServer({ token, instance_id });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: String(err?.message ?? err) });
  }
}
