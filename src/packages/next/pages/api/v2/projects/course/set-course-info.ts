import getAccountId from "lib/account/get-account";
import setCourseInfo from "@cocalc/server/projects/course/set-course-info";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { course, project_id } = getParams(req);

  return await setCourseInfo({ account_id, project_id, course });
}
