/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Frame that displays the raw JSON for a Jupyter Notebook
*/

import { React } from "../../app-framework";

import { JSONView } from "../../jupyter/json-view";

import { JupyterEditorActions } from "./actions";

interface Props {
  actions: JupyterEditorActions;
  font_size: number;
}

const JsonView: React.FC<Props> = ({
  actions,
  font_size,
}) => {
  return (
    <JSONView
      actions={actions.jupyter_actions}
      font_size={font_size}
    />
  );
};

export default JsonView;
