/*
API endpoint to create a new project.

This requires the user to be signed in so they are allowed to create a project.
*/
import getAccountId from "lib/account/get-account";
import create from "@cocalc/server/projects/create";
import getFromPool from "@cocalc/server/projects/pool/get-project";
import getParams from "lib/api/get-params";
import { associatedLicense } from "@cocalc/server/licenses/public-path";

export default async function handle(req, res) {
  const { title, description, image, license, public_path_id } = getParams(req);
  const account_id = await getAccountId(req);
  try {
    const project_id = await createProject(
      account_id,
      title,
      description,
      image,
      license,
      public_path_id
    );
    res.json({ project_id });
  } catch (err) {
    res.json({ error: err.message });
  }
}

async function createProject(
  account_id,
  title,
  description,
  image,
  license,
  public_path_id?: string
): Promise<string> {
  if (!account_id) {
    throw Error("user must be signed in");
  }
  // Try to get from pool if no license and no image specified (so the default).
  if (!image && !license) {
    if (public_path_id && !(await associatedLicense(public_path_id))) {
      const project_id = await getFromPool({ account_id, title, description });
      if (project_id != null) {
        return project_id;
      }
    }
  }

  return await create({
    account_id,
    title,
    description,
    image,
    license,
    public_path_id,
  });
}
