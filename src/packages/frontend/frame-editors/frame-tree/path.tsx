/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { CSS, React, redux } from "../../app-framework";
import { filename_extension } from "@cocalc/util/misc";
import { file_associations } from "../../file-associations";
import { Icon } from "../../components";

interface Props {
  is_current?: boolean;
  project_id: string;
  path: string;
  commentSelection?;
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
  ({ is_current, path, project_id, commentSelection }) => {
    console.log("Path", is_current, commentSelection);
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
        {is_current && commentSelection != null && (
          <Button
            size="small"
            style={{ position: "absolute", right: "1px", height: "19px" }}
            onClick={() => {
              const actions = redux.getEditorActions(project_id, path);
              actions.addComment({ loc: commentSelection });
            }}
          >
            <Icon name="comment" /> Add comment
          </Button>
        )}
      </div>
    );
  },
);
