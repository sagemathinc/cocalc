import {
  getLicenseStatus,
  isLaunchpadMode,
} from "@cocalc/server/software-licenses/activation";

<<<<<<< HEAD
export default async function handle(_req, res) {
||||||| f47e9a0adb
=======
export default async function handle(req, res) {
>>>>>>> b1e11986e362b0b55b2da835d6f7be487b670692
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
