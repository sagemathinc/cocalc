import listNews from "@cocalc/server/news/list";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const params = getParams(req, {
      allowGet: true,
    });
    res.json(await listNews(params));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
