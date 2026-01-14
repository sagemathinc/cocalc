/*
API endpoint to create a new project.

This requires the user to be signed in so they are allowed to create a project.
*/
import getAccountId from "lib/account/get-account";
import create from "@cocalc/server/projects/create";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const { title, description, image, public_path_id } = getParams(req);
  const account_id = await getAccountId(req);
  try {
    const project_id = await createProject(
      account_id,
      title,
      description,
      image,
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
  public_path_id?: string
): Promise<string> {
  if (!account_id) {
    throw Error("user must be signed in");
  }
  return await create({
    account_id,
    title,
    description,
    image,
    public_path_id,
  });
}
