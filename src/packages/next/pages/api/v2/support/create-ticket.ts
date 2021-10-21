/*
Create a support ticket.
*/

import createSupportTicket from "@cocalc/backend/support/create-ticket";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request." });
    return;
  }

  const { options } = req.body;

  let url;
  try {
    url = await createSupportTicket(options);
    console.log("createSupportTicket returned", {url});
  } catch (err) {
    res.json({ error: `${err}` });
    return;
  }
  res.json({ url });
}
