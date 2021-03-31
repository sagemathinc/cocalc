/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React, redux } from "../../app-framework";
import { filename_extension } from "smc-util/misc";
import { file_associations } from "../../file-associations";
import { Icon } from "../../r_misc";

interface Props {
  is_current?: boolean;
  project_id: string;
  path: string;
}

const STYLE = {
  borderBottom: "1px solid lightgrey",
  borderRight: "1px solid lightgrey",
  padding: "0 5px",
  borderTopLeftRadius: "5px",
  borderTopRightRadius: "5px",
  color: "#337ab7",
  cursor: "pointer",
  width: "100%",
  fontSize: "10pt",
} as CSS;

const CURRENT_STYLE = {
  ...STYLE,
  ...{ background: "#337ab7", color: "white" },
} as CSS;

export const Path: React.FC<Props> = React.memo(
  ({ is_current, path, project_id }) => {
    const ext = filename_extension(path);
    const x = file_associations[ext];
    return (
      <div
        style={is_current ? CURRENT_STYLE : STYLE}
        onClick={(evt) => {
          // shift+clicking opens the given path as its own tab...
          if (!evt.shiftKey) return;
          const project_actions = redux.getProjectActions(project_id);
          project_actions.open_file({ path, foreground: true });
        }}
      >
        {x?.icon && <Icon name={x.icon} />} {path}
      </div>
    );
  }
);
