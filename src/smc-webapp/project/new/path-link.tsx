/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { ProjectActions } from "../../project_actions";

const a_style: React.CSSProperties = {
  cursor: "pointer",
};

interface Props {
  path: string;
  actions: ProjectActions;
  default_value?: string;
}
// NOTE: This just happens to have the same name as r_misc.PathLink
// but is a different thing used for a different purpose...
export const PathLink = React.memo(function PathLink({
  path,
  actions,
  default_value = "home directory of project",
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
