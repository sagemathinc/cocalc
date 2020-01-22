import * as React from "react";
import { ProjectActions } from "../../project_actions";

const a_style: React.CSSProperties = {
  cursor: "pointer"
};

interface Props {
  path: string;
  actions: ProjectActions;
  default_value?: string;
}
// TODO: Should this be r_misc.PathLink??
export const PathLink = React.memo(function PathLink({
  path,
  actions,
  default_value = "home directory of project"
}: Props): JSX.Element {
  const handle_click = React.useCallback(
    function handle_click() {
      actions.set_active_tab("files");
    },
    [actions]
  );

  return (
    <a style={a_style} onClick={handle_click}>
      {path ?? default_value}
    </a>
  );
});
