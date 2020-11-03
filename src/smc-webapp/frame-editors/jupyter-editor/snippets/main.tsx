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
  CSS,
  useEffect,
  useState,
  useStore,
  useMemo,
  // useActions,
  // useTypedRedux,
  useRedux,
  // TypedMap,
} from "../../../app-framework";
import { JupyterEditorActions } from "../actions";
import { JupyterStore } from "../../../jupyter/store";
import { NotebookFrameStore } from "../cell-notebook/store";
import { Loading, Markdown } from "../../../r_misc";
// import { COLORS } from "smc-util/theme";
import { sortBy } from "lodash";
import {
  Button,
  Collapse,
  //   Descriptions,
  //   Divider,
  //   Switch,
  //   Typography,
  //   Table,
} from "antd";
import { CaretRightOutlined } from "@ant-design/icons";
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

type SnippetEntry = {
  entries: [title: string, snippet: [code: string | string[], descr?: string]];
  sortweight?: number;
};

type SnippetEntries = {
  [key: string]: SnippetEntry;
};

type Snippets = {
  [key: string]: SnippetEntries;
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
    // font_size,
    actions: frame_actions,
    // project_id,
    local_view_state,
  } = props;
  const jupyter_actions = frame_actions.jupyter_actions;

  // the most recent notebook frame id, i.e. that's where we'll insert cells
  const [jupyter_id, set_jupyter_id] = useState<string | undefined>();
  const jupyter_store = useStore<JupyterStore>({ name: jupyter_actions.name });
  const kernel = useRedux(jupyter_actions.name, "kernel");
  const kernel_info = useRedux(jupyter_actions.name, "kernel_info");
  const [lang, set_lang] = useState<string | undefined>();
  const [snippets, set_snippets] = useState<Snippets | undefined>();

  const data = useData();

  // get_kernel_language() depends on kernel and kernel_info
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

  function insert_snippet({ code, descr }): void {
    if (jupyter_id == null) return;
    const frame_store = new NotebookFrameStore(frame_actions, jupyter_id);
    const notebook_frame_actions = frame_actions.get_frame_actions(jupyter_id);
    // unlikely, unless it was closed or so …
    if (notebook_frame_actions == null) return;
    const sel_cells = frame_store.get_selected_cell_ids_list();
    let id = sel_cells[sel_cells.length - 1];
    // markdown cell
    id = jupyter_actions.insert_cell_adjacent(id, +1);
    jupyter_actions.set_cell_input(id, descr);
    jupyter_actions.set_cell_type(id, "markdown");
    // code cells
    for (const c of code) {
      id = jupyter_actions.insert_cell_adjacent(id, +1);
      jupyter_actions.set_cell_input(id, c);
      notebook_frame_actions.set_cur_id(id);
      jupyter_actions.run_code_cell(id);
    }
  }

  function render_insert({ code, descr }) {
    return (
      <Button
        size={"small"}
        type={"primary"}
        onClick={(e) => {
          insert_snippet({ code, descr });
          e.stopPropagation();
        }}
      >
        insert
      </Button>
    );
  }

  function render_snippet([title, snippet]) {
    const code = typeof snippet[0] === "string" ? [snippet[0]] : snippet[0];
    const descr = snippet[1];
    const extra = render_insert({ code, descr });
    return (
      <Collapse.Panel
        header={title}
        key={title}
        className="cc-jupyter-snippet"
        extra={extra}
      >
        <div className="cc-jupyter-snippet-content">
          <Markdown value={descr} />
          {code.map((v, idx) => (
            <pre key={idx}>{v}</pre>
          ))}
        </div>
      </Collapse.Panel>
    );
  }

  function render_level2([title, data]): JSX.Element {
    return (
      <Collapse.Panel key={title} header={title}>
        <Collapse
          bordered={false}
          defaultActiveKey={["1"]}
          expandIcon={({ isActive }) => (
            <CaretRightOutlined rotate={isActive ? 90 : 0} />
          )}
          className="cc-jupyter-snippet-collapse"
        >
          {data.entries.map(render_snippet)}
        </Collapse>
      </Collapse.Panel>
    );
  }

  function render_level1([title, entries]: [
    string,
    SnippetEntries
  ]): JSX.Element {
    const lvl2 = sortBy(Object.entries(entries), ([_, v]) => v.sortweight);
    return (
      <Collapse.Panel
        key={title}
        header={title}
        className="cc-jupyter-snippets"
      >
        <Collapse ghost destroyInactivePanel>
          {lvl2.map(render_level2)}
        </Collapse>
      </Collapse.Panel>
    );
  }

  function render_snippets(): JSX.Element {
    if (lang == null) return <div>Kernel not loaded.</div>;
    if (snippets == null) return <Loading />;
    const style: CSS = { overflowY: "auto" };
    const sfun = (k) => [-["Introduction", "Tutorial"].indexOf(k), k];
    const lvl1 = sortBy(Object.entries(snippets), ([k, _]) => sfun(k));
    return <Collapse style={style}>{lvl1.map(render_level1)}</Collapse>;
  }

  return useMemo(() => render_snippets(), [snippets]);
});
