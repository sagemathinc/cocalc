import { callback2, once } from "smc-util/async-utils";
import { delay } from "awaiting";
import { redux } from "../app-framework";
import { QueryParams } from "../misc/query-params";
const { APP_BASE_URL, get_cookie } = require("../misc_page");
import { separate_file_extension } from "smc-util/misc2";

/*
If the anonymous query param is set at all (doesn't matter to what) during
initial page load.

Also do NOT make true of has_remember_me is set, since then probably
the user has an account.
*/
export function should_do_anonymous_setup(): boolean {
  const anonymous_query_param = QueryParams.get("anonymous");
  // console.log("anonymous_query_param = ", anonymous_query_param);
  // console.log("cookie = ", get_cookie(`${APP_BASE_URL}has_remember_me`));
  const resp =
    anonymous_query_param !== undefined &&
    get_cookie(`${APP_BASE_URL}has_remember_me`) != "true";
  // console.log("should_do_anonymous_setup ", resp);
  return resp;
}

export async function do_anonymous_setup(client: any): Promise<void> {
  function log(..._args): void {
    // uncomment to debug...
    // console.log("do_anonymous_setup", ..._args);
  }
  log();
  try {
    redux.getActions("account").setState({ doing_anonymous_setup: true });
    log("creating account");
    const x = await callback2(client.create_account.bind(client), {});
    if (x != null && x.event == "account_creation_failed") {
      log("failed to create account", x);
      // If there is an error specifically with creating the account
      // due to the backend not allowing it (e.g., missing token), then
      // it is fine to silently return, which falls back to the login
      // screen.  Of course, all other errors below should make some noise.
      return;
    }
    if (!client.is_signed_in()) {
      log("waiting to be signed in");
      await once(this, "signed_in");
    }
    const actions = redux.getActions("projects");
    log("creating project");
    const project_id = await actions.create_project({
      title: "Welcome to CoCalc!",
      start: true,
      description: ""
    });
    log("opening project");
    actions.open_project({ project_id, switch_to: true });

    const launch_actions = redux.getStore("launch-actions");
    if (launch_actions != null && launch_actions.get("launch")) {
      console.log(
        "anonymous setup: do nothing further since there is a launch action"
      );
      return;
    }

    open_welcome_file(project_id);
  } catch (err) {
    console.warn("ERROR doing anonymous sign up -- ", err);
    log("err", err);
    // There was an error creating the account (probably), so we do nothing
    // further involving making an anonymous account.
    // If the user didn't get signed in, this will fallback to sign in page, which
    // is reasonable behavior.
    // Such an error *should* happen if, e.g., a sign in token is required,
    // or maybe this user's ip is blocked. Falling back
    // to normal sign up makes sense in this case.
    return;
  } finally {
    redux.getActions("account").setState({ doing_anonymous_setup: false });
    log("removing anonymous param");
    // In all cases, remove the 'anonymous' parameter. This way if
    // they refresh their browser it won't cause confusion.
    QueryParams.remove("anonymous");
  }
}

async function open_welcome_file(project_id: string): Promise<void> {
  const qparam = QueryParams.get("anonymous");
  if (qparam == null) return;
  const param: string = (Array.isArray(qparam)
    ? qparam[0]
    : qparam
  ).toLowerCase();

  const path = (function(): string | undefined {
    switch (param) {
      case "ipynb":
      case "jupyter":
      case "python":
      case "true":
        // TODO expand this first notebook to be a bit more exciting…
        return "Welcome to CoCalc.ipynb";
      case "r":
      case "jupyter-r":
        // TODO: pre-select the R kernel
        return "Welcome to CoCalc.ipynb";
      case "linux":
      case "terminal":
        return "Welcome to CoCalc.term";
      case "sagews":
      case "sage":
        return "Welcome to CoCalc.sagews";
      case "latex":
        return "Welcome-to-CoCalc.tex";
      case "x11":
        return "Welcome to CoCalc.x11";
      default:
        console.warn(`Got unknown param=${param}`);
        return undefined;
    }
  })();

  if (path == null) return;
  await open_file(path, project_id);

  // optional, some additional jupyter notebook setup
  const switch_kernel = async name => {
    let editor_actions: any;
    // inspired by nbgrader actions
    while (true) {
      editor_actions = redux.getEditorActions(project_id, path);
      if (editor_actions != null) break;
      await delay(200);
    }

    const jactions = editor_actions.jupyter_actions as any;
    if (jactions.syncdb.get_state() == "init") {
      await once(jactions.syncdb, "ready");
    }
    jactions.set_kernel(name);
    await jactions.save(); // TODO how to make sure get_cell_list() has at least one cell?
    let cell_id = jactions.store.get_cell_list().first();
    jactions.set_cell_input(
      cell_id,
      "# Welcome to R\n\nEvaluate cells via Shift+Return!"
    );
    jactions.set_cell_type(cell_id, "markdown");
    cell_id = jactions.insert_cell_adjacent(cell_id, +1);
    jactions.set_cell_input(cell_id, "data <- rnorm(100)\nsummary(data)");
    jactions.run_code_cell(cell_id);
    cell_id = jactions.insert_cell_adjacent(cell_id, +1);
    jactions.set_cell_input(cell_id, "hist(data)");
    jactions.run_code_cell(cell_id);
  };

  switch (param) {
    case "ipynb":
    case "python":
      await switch_kernel("python3");
      break;
    case "jupyter-r":
    case "r":
      await switch_kernel("ir");
      break;
  }
}

async function open_file(path: string, project_id: string): Promise<void> {
  const project_actions = redux.getProjectActions(project_id);
  const { name, ext } = separate_file_extension(path);
  await project_actions.create_file({
    name,
    ext,
    current_path: "",
    switch_over: true
  });
}
