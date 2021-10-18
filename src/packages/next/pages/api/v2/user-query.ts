/*
User query endpoint.
*/

import userQuery from "@cocalc/database/user-query";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request" });
    return;
  }

  const { query } = req.body;

  try {
    const result = await userQuery({ query });
    console.log(result);
    res.json({ result });
  } catch (err) {
    res.json({ error: `${err}` });
  }
}
