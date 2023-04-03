/*
Get all the available Jupyter kernels that the Jupyter API server hosted here provides.
*/
import getKernels from "@cocalc/server/jupyter/kernels";

export default async function handle(_req, res) {
  try {
    res.json({ kernels: await getKernels(), success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
