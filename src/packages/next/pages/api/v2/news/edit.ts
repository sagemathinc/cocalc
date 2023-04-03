import editNews from "@cocalc/server/news/edit";
import getAccountId from "lib/account/get-account";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const result = await doIt(req);
    res.json({ ...result, success: true });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function doIt(req) {
  const { id, title, text, time, channel, url } = getParams(req);

  const account_id = await getAccountId(req);

  if (account_id == null) {
    throw Error("must be signed in to create/edit news");
  }

  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can create/edit news items");
  }

  if (title == null) {
    throw new Error("must provide title");
  }

  if (text == null) {
    throw new Error("must provide text");
  }

  return await editNews({
    id,
    title,
    text,
    url,
    time: time ? new Date(time) : new Date(),
    channel,
  });
}
