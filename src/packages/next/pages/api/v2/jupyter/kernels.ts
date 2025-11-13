/*
Get all the available Jupyter kernels that the Jupyter API server
hosted here provides.

If project_id is specified, user must be signed in as a collab on that
project, and then they get the kernels that are supported by that project.
*/
import getKernels from "@cocalc/server/jupyter/kernels";
import getParams from "lib/api/get-params";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  const { project_id } = getParams(req);
  const account_id = project_id != null ? await getAccountId(req) : undefined;
  try {
    res.json({
      kernels: await getKernels({ project_id, account_id }),
      success: true,
    });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
