export let lite = false;

export function init(redux) {
  console.log("Initializing CoCalc Lite!");
  lite = true;
  redux.getActions("account").setState({ is_logged_in: true });
  redux.getActions("projects").setState({
    open_projects: ["00000000-0000-4000-8000-000000000000"],
  });
  redux
    .getActions("page")
    .set_active_tab("00000000-0000-4000-8000-000000000000");
}
