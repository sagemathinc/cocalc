import { callback2, once } from "smc-util/async-utils";
import { redux } from "../app-framework";

export async function do_anonymous_setup(client: any): Promise<void> {
  try {
    const x = await callback2(client.create_account, {});
    if (x != null && x.event == "account_creation_failed") {
      throw Error("Temporary account creation failed");
    }
    if (!client.is_signed_in()) {
      await once(this, "signed_in");
    }
    const actions = redux.getActions("projects");
    const project_id = await actions.create_project({
      title: "Welcome to CoCalc!",
      start: true,
      description: ""
    });
    actions.open_project({ project_id, switch_to: true });
    // Also change default account settings to not ask for the kernel,
    // since that adds friction.
    redux.getTable("account").set({
      editor_settings: {
        ask_jupyter_kernel: false,
        jupyter: { kernel: "python3" }
      }
    });
    // Open a new Jupyter notebook:
    const project_actions = redux.getProjectActions(project_id);
    project_actions.open_file({
      path: "Welcome to CoCalc.ipynb",
      foreground: true
    });
  } catch (err) {
    // There was an error creating the account (probably), so we do nothing further.
    // If the user didn't get signed in, this will fall back to sign in page, which
    // is reasonable behavior.
    // Such an error *should* happen if, e.g., a sign in token is required,
    // or maybe this user's ip is blocked. Falling back
    // to normal sign up makes sense in this case.
    return;
  } finally {
    // In all cases, remove the query parameters from the URL after doing
    // the anonymous sign in.  This way if they refresh their browser it
    // won't cause confusion.
    const i = window.location.href.indexOf("?");
    if (i !== -1) {
      window.history.pushState("", "", window.location.href.slice(0, i));
    }
    return;
  }
}
