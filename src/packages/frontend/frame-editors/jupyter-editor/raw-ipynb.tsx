/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Frame that displays the raw JSON for a Jupyter Notebook
*/



import { RawEditor } from "../../jupyter/raw-editor";

import { JupyterEditorActions } from "./actions";

import { Map, fromJS } from "immutable";
import { cm_options } from "../codemirror/cm-options";

interface Props {
  actions: JupyterEditorActions;
  font_size: number;
  editor_settings: Map<string, any>;
  project_id: string;
}

export const RawIPynb: React.FC<Props> = ({
  actions,
  font_size,
  editor_settings,
  project_id,
}) => {
  return (
    <RawEditor
      name={actions.jupyter_actions.name}
      actions={actions.jupyter_actions}
      font_size={font_size}
      cm_options={fromJS(cm_options("a.json", editor_settings))}
      project_id={project_id}
    />
  );
};
