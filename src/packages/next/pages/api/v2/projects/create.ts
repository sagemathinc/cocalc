/*
API endpoint to create a new project.

This requires the user to be signed in so they are allowed to create a project.
*/
import getAccountId from "lib/account/get-account";
import create from "@cocalc/server/projects/create";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const { title, description, image, license } = req.body;
  const account_id = await getAccountId(req);

  try {
    const project_id = await createProject(
      account_id,
      title,
      description,
      image,
      license
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
  license
): Promise<string> {
  if (!account_id) {
    throw Error("user must be signed in");
  }
  if (!title) {
    throw Error("project title is required");
  }
  return await create({ account_id, title, description, image, license });
}
