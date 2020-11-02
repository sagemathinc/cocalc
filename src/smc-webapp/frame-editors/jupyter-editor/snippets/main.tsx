/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// lazy loading the json file via webpack – using @types/webpack-env doesn't work
declare var require: {
  <T>(path: string): T;
  (paths: string[], callback: (...modules: any[]) => void): void;
  ensure: (
    paths: string[],
    callback: (require: <T>(path: string) => T) => void
  ) => void;
};

import {
  React,
  // CSS,
  useEffect,
  useState,
  useStore,
  // useActions,
  // useTypedRedux,
  useRedux,
  // TypedMap,
} from "../../../app-framework";
import { JupyterEditorActions } from "../actions";
import { JupyterStore } from "../../../jupyter/store";
import { NotebookFrameStore } from "../cell-notebook/store";
import { Loading } from "../../../r_misc";
import {
  Button,
  //   Collapse,
  //   Descriptions,
  //   Divider,
  //   Switch,
  //   Typography,
  //   Table,
} from "antd";
// import {
//   FolderOpenOutlined,
//   InfoCircleOutlined,
//   FileOutlined,
//   ControlOutlined,
//   QuestionCircleOutlined,
// } from "@ant-design/icons";

interface Props {
  font_size: number;
  project_id: string;
  actions: JupyterEditorActions;
  local_view_state: Map<string, any>;
}

type Snippets = {
  [key: string]: {
    [key: string]: {
      entries: [
        title: string,
        snippet: [code: string | string[], descr?: string]
      ];
      sortweight?: number;
    };
  };
};

function useData() {
  const [data, set_data] = useState<{ [lang: string]: Snippets | undefined }>();
  if (data == null) {
    // this file is supposed to be in webapp-lib/examples/examples.json
    //     follow "./install.py examples" to see how the makefile is called during build
    require.ensure([], function () {
      set_data(require("webapp-lib/examples/examples.json"));
    });
  }
  return data;
}

export const JupyterSnippets: React.FC<Props> = React.memo((props: Props) => {
  const {
    font_size,
    actions: frame_actions,
    project_id,
    local_view_state,
  } = props;
  const jupyter_actions = frame_actions.jupyter_actions;

  console.log(
    "props:",
    font_size,
    jupyter_actions,
    project_id,
    local_view_state
  );

  // the most recent notebook frame id, i.e. that's where we'll insert cells
  const [jupyter_id, set_jupyter_id] = useState<string | undefined>();
  const jupyter_store = useStore<JupyterStore>({ name: jupyter_actions.name });
  const kernel = useRedux(jupyter_actions.name, "kernel");
  const kernel_info = useRedux(jupyter_actions.name, "kernel_info");
  const [lang, set_lang] = useState<string | undefined>();
  const [snippets, set_snippets] = useState<Snippets | undefined>();

  const data = useData();

  useEffect(() => {
    const next_lang = jupyter_store.get_kernel_language();
    if (next_lang != lang) set_lang(next_lang);
  }, [kernel, kernel_info]);

  useEffect(() => {
    if (data == null || lang == null) return;
    set_snippets(data[lang]);
  }, [data, lang]);

  useEffect(() => {
    const jid = frame_actions._get_most_recent_active_frame_id_of_type(
      "jupyter_cell_notebook"
    );
    if (jid == null) return;
    if (jupyter_id != jid) set_jupyter_id(jid);
  }, [local_view_state]);

  function insert_snippet(): void {
    if (jupyter_id == null) return;
    const frame_store = new NotebookFrameStore(frame_actions, jupyter_id);
    const notebook_frame_actions = frame_actions.get_frame_actions(jupyter_id);
    // unlikely, unless it was closed or so …
    if (notebook_frame_actions == null) return;
    const sel_cells = frame_store.get_selected_cell_ids_list();
    let id = sel_cells[sel_cells.length - 1];
    // markdown cell
    id = jupyter_actions.insert_cell_adjacent(id, +1);
    jupyter_actions.set_cell_input(id, "test input " + new Date().getTime());
    jupyter_actions.set_cell_type(id, "markdown");
    // code cell
    id = jupyter_actions.insert_cell_adjacent(id, +1);
    jupyter_actions.set_cell_input(id, "from time import time\ntime()");
    notebook_frame_actions.set_cur_id(id);
    jupyter_actions.run_code_cell(id);
  }

  function render_selector(): JSX.Element {
    return <Button onClick={() => insert_snippet()}>insert snippet</Button>;
  }

  function render_snippets(): JSX.Element {
    if (lang == null) return <div>Kernel not loaded.</div>;
    if (snippets == null) return <Loading />;

    return <pre>{Object.keys(snippets).map((k) => `${k}\n`)}</pre>;
  }

  return (
    <>
      <div>Jupyter Snippets</div>
      {render_selector()}
      {render_snippets()}
    </>
  );
});
