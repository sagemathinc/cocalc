/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Top-level react component for task list
*/

import { React, useEditorRedux } from "../../app-framework";

import { Loading } from "../../r_misc";

import { WhiteboardActions } from "./actions";
import { WhiteboardState } from "./types";

interface Props {
  actions: WhiteboardActions;
  path: string;
  project_id: string;
}

export const WhiteboardEditor: React.FC<Props> = React.memo(
  ({ actions, path, project_id }) => {
    const useEditor = useEditorRedux<WhiteboardState>({ project_id, path });
    actions = actions;

    const objects = useEditor("objects");
    const local_view_state = useEditor("local_view_state");
    const read_only = useEditor("read_only");
    console.log({ objects, local_view_state, read_only });

    if (objects == null) {
      return (
        <div
          style={{
            fontSize: "40px",
            textAlign: "center",
            padding: "15px",
            color: "#999",
          }}
        >
          <Loading />
        </div>
      );
    }

    return (
      <div className={"smc-vfill"}>
        <pre>{JSON.stringify(objects, undefined, 2)}</pre>
      </div>
    );
  }
);
