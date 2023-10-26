/*
Set the state of a component.   This is mainly used from the backend to convey information to user
about what is going on in a compute server.

Example use, where 'sk-eTUKbl2lkP9TgvFJ00001n' is a project api key.

curl -sk -u sk-eTUKbl2lkP9TgvFJ00001n: -d '{"id":"13","name":"foo","value":"bar389"}' -H 'Content-Type: application/json' https://cocalc.com/api/v2/compute/set-component-state
*/

// api_key resolvs to a project id.
import getProjectId from "lib/account/get-account";
import setComponentState from "@cocalc/server/compute/set-component-state";
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
  const project_id = await getProjectId(req);
  if (!project_id) {
    throw Error("invalid api key");
  }
  const { id, name, state, extra, timeout, progress } = getParams(req);
  await setComponentState({
    project_id,
    id,
    name,
    state,
    extra,
    timeout,
    progress,
  });
  return { status: "ok" };
}
