import {
  getLicenseStatus,
  isLaunchpadMode,
} from "@cocalc/server/software-licenses/activation";

export default async function handle(_req, res) {
  try {
    if (!isLaunchpadMode()) {
      res.json({ activated: true });
      return;
    }
    res.json(await getLicenseStatus());
  } catch (err) {
    res.status(500).json({ error: String(err?.message ?? err) });
  }
}
