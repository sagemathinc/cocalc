/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Raw editable view of .ipynb file json, including metadata.

WARNING:  There are many similarities between the code in json-editor and in
the file codemirror-editor.tsx, and also many differences.  Part of the
subtlely comes from editing JSON, but not saving when state is invalid.

TODO/thought: I wonder if jsonic would be better, since it would basically
make a much wider range of "json-ish" stuff valid.  Given the use case for
this (?), it might be fine.
*/

import { React, useEffect, useRedux } from "../app-framework";
import { useInterval } from 'react-interval-hook';
import { Map } from "immutable";
import { JSONEditor } from "./json-editor";
import { JupyterActions } from "./browser-actions";
import { Loading } from "../r_misc";
import { useStudentProjectFunctionality } from "smc-webapp/course";

interface Props {
  name: string;
  actions: JupyterActions;
  font_size: number;
  cm_options: Map<string, any>;
  project_id: string;
}

export const RawEditor: React.FC<Props> = ({
  name,
  actions,
  font_size,
  cm_options,
  project_id,
}) => {
  // we ONLY want to update raw_ipynb when the things it depends on change **and**
  // this component is mounted, since it can be very expensive to update.
  const raw_ipynb = useRedux([name, "raw_ipynb"]);
  // This is more or less what raw_ipynb depends on, according to store.ts:
  const cells = useRedux([name, "cells"]);
  const cell_list = useRedux([name, "cell_list"]);
  const metadata = useRedux([name, "metadata"]);
  const kernels = useRedux([name, "kernels"]);
  useEffect(() => {
    actions.set_raw_ipynb();
  }, [cells, cell_list, metadata, kernels]);

  // We setup an interval to be certain that the
  // raw ipynb has every chance to be set, since there
  // are cases where none of cells, cell_list, metadata, kernels
  // change, raw_ipynb isn't set yet, and calling
  // set_raw_ipynb *once* initially is not sufficient
  // (just because things weren't setup completely yet).
  // See https://github.com/sagemathinc/cocalc/issues/4579
  useInterval(() => {
    if (raw_ipynb == null) {
      actions.set_raw_ipynb();
    }
  }, 5000);

  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  if (student_project_functionality.disableJupyterToggleReadonly) {
    return (
      <b style={{ margin: "auto", fontSize: "14pt", padding: "15px" }}>
        Raw JSON editor is currently disabled in this project. Please contact
        your instructor if you have questions.
      </b>
    );
  }

  if (raw_ipynb == null) {
    return <Loading />;
  }

  const style: React.CSSProperties = {
    fontSize: `${font_size}px`,
    backgroundColor: "#eee",
    height: "100%",
    overflowY: "auto",
    overflowX: "hidden",
  };

  const viewer_style: React.CSSProperties = {
    backgroundColor: "#fff",
    boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)",
    height: "100%",
  };

  return (
    <div style={style}>
      <div style={viewer_style}>
        <JSONEditor
          value={raw_ipynb}
          font_size={font_size}
          on_change={(obj) => actions.set_to_ipynb(obj)}
          cm_options={cm_options}
          undo={() => actions.undo()}
          redo={() => actions.redo()}
        />
      </div>
    </div>
  );
};
