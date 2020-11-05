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
  useRedux,
} from "../../../app-framework";
import { JupyterEditorActions } from "../actions";
import { JupyterStore } from "../../../jupyter/store";
import { NotebookFrameStore } from "../cell-notebook/store";
import { Loading, Markdown } from "../../../r_misc";
import { COLORS } from "smc-util/theme";
import { sortBy, pick, debounce } from "lodash";
import { Button, Collapse, Checkbox, Typography, Input, Row, Col } from "antd";
import { CaretRightOutlined } from "@ant-design/icons";

const BUTTON_TEXT = "pick";

const HEADER_SORTER = ([k, _]) => -["Introduction", "Tutorial"].indexOf(k);

interface Props {
  font_size: number;
  project_id: string;
  actions: JupyterEditorActions;
  local_view_state: Map<string, any>;
}

type SnippetDoc = [
  title: string,
  snippet: [code: string | string[], descr: string]
];

type Vars = { [name: string]: string };

interface SnippetEntry {
  entries: SnippetDoc[];
  sortweight?: number;
  setup?: "string";
  variables?: Vars;
}

type SnippetEntries = {
  [key: string]: SnippetEntry;
};

type Snippets = {
  [key: string]: SnippetEntries;
};

function filter_snippets(raw: Snippets, str?: string) {
  const res: Snippets = {};
  for (const [k1, lvl1] of Object.entries(raw)) {
    for (const [k2, lvl2] of Object.entries(lvl1)) {
      const entries =
        str != null && str != ""
          ? lvl2.entries.filter((doc: SnippetDoc) => {
              const inLvl1 = k1.toLowerCase().indexOf(str) != -1;
              const inLvl2 = k2.toLowerCase().indexOf(str) != -1;
              const title = doc[0];
              const descr = doc[1][1];
              const inTitle = title.toLowerCase().indexOf(str) != -1;
              const inDescr = descr.toLowerCase().indexOf(str) != -1;
              return inLvl1 || inLvl2 || inTitle || inDescr;
            })
          : lvl2.entries;
      if (entries.length > 0) {
        if (res[k1] == null) res[k1] = {};
        res[k1][k2] = {
          entries,
          ...pick(lvl2, ["setup", "variables"]),
        };
      }
    }
  }
  return res;
}

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

function generate_setup_code_extra(args): string | undefined {
  const { vars, code } = args;
  if (vars == null) return;

  // ... each line for variables inside of function calls
  // assuming function calls are after the first open ( bracket
  const re = /\b([a-zA-Z_0-9]+)/g;
  // all detected variable names are collected in that array
  const varincode: string[] = [];
  code.forEach((block) => {
    block.split("\n").forEach((line) => {
      if (line.includes("(")) {
        line = line.slice(line.indexOf("("));
      }
      line.replace(re, (_, g) => {
        varincode.push(g);
        return ""; // ← to make TS happy
      });
    });
  });

  // then we add name = values lines to set only these
  // TODO syntax needs to be language specific!
  return Object.entries(vars)
    .filter(([k, _]) => varincode.includes(k))
    .map(([k, v]) => `${k} = ${v}`)
    .join("\n");
}

function generate_setup_code(args: {
  code: string[];
  data: SnippetEntry;
}): string {
  const { code, data } = args;
  const { setup, variables: vars } = data;

  // given we have a "variables" dictionary, we check
  const extra = generate_setup_code_extra({ vars, code });

  let ret = "";
  if (setup) {
    ret += `${setup}`;
  }
  if (extra) {
    ret += `\n${extra}`;
  }
  return ret;
}

const Highlight: React.FC<{
  text: string;
  search: string;
  style?: CSS;
}> = React.memo(({ text, search, style }) => {
  function highlight_md(descr, search) {
    if (search == null || search === "") return descr;
    const pos = descr.toLowerCase().indexOf(search.toLowerCase());
    if (pos == -1) return descr;
    const hit = descr.slice(pos, pos + search.length);
    const hl =
      descr.slice(0, pos) +
      `<span class='hl'>${hit}</span>` +
      descr.slice(pos + search.length);
    return hl;
  }

  return (
    <Markdown
      className={"cc-jupyter-snippet-header"}
      style={style}
      value={highlight_md(text, search)}
    />
  );
});

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
  const [insert_setup, set_insert_setup] = useState<boolean>(true);
  const [search, set_search] = useState<string>("");
  const set_search_debounced = debounce(set_search, 333);

  const data = useData();

  // get_kernel_language() depends on kernel and kernel_info
  useEffect(() => {
    const next_lang = jupyter_store.get_kernel_language();
    if (next_lang != lang) set_lang(next_lang);
  }, [kernel, kernel_info]);

  const snippets = useMemo(() => {
    if (data == null || lang == null) return;
    const raw = data[lang];
    if (raw == null) return;
    // we also pass the raw data through the filter if the string is empty,
    // such that no headers without any data do not show up
    return filter_snippets(raw, search);
  }, [data, lang, search]);

  useEffect(() => {
    const jid = frame_actions._get_most_recent_active_frame_id_of_type(
      "jupyter_cell_notebook"
    );
    if (jid == null) return;
    if (jupyter_id != jid) set_jupyter_id(jid);
  }, [local_view_state]);

  function insert_snippet(args: { code: string; descr?: string }): void {
    const { code, descr } = args;
    if (jupyter_id == null) return;
    const frame_store = new NotebookFrameStore(frame_actions, jupyter_id);
    const notebook_frame_actions = frame_actions.get_frame_actions(jupyter_id);
    // unlikely, unless it was closed or so …
    if (notebook_frame_actions == null) return;
    const sel_cells = frame_store.get_selected_cell_ids_list();
    let id = sel_cells[sel_cells.length - 1];

    // optional markdown cell with a description
    if (descr != null) {
      id = jupyter_actions.insert_cell_adjacent(id, +1);
      jupyter_actions.set_cell_input(id, descr);
      jupyter_actions.set_cell_type(id, "markdown");
    }

    // code cells
    for (const c of code) {
      id = jupyter_actions.insert_cell_adjacent(id, +1);
      jupyter_actions.set_cell_input(id, c);
      notebook_frame_actions.set_cur_id(id);
      jupyter_actions.run_code_cell(id);
    }
    notebook_frame_actions.scroll("cell visible");
  }

  function render_insert({ code, descr }, link = false) {
    if (!code) return;
    const text = link ? "← insert code" : BUTTON_TEXT;
    return (
      <Button
        size={"small"}
        type={link ? "link" : "primary"}
        onClick={(e) => {
          insert_snippet({ code, descr });
          e.stopPropagation();
        }}
      >
        {text}
      </Button>
    );
  }

  function render_snippet(
    lvl3_title: string,
    doc: SnippetDoc[1],
    data: SnippetEntry
  ) {
    const code =
      doc[0] === ""
        ? undefined
        : typeof doc[0] === "string"
        ? [doc[0]]
        : doc[0];
    if (code != null && insert_setup) {
      const setup = generate_setup_code({ code, data });
      if (setup != "") code.unshift(setup);
    }
    const descr = doc[1];
    const extra = render_insert({ code, descr });
    const header = <Highlight text={lvl3_title} search={search} />;
    return (
      <Collapse.Panel
        header={header}
        key={lvl3_title}
        className="cc-jupyter-snippet"
        extra={extra}
        showArrow={search === ""}
      >
        <div className="cc-jupyter-snippet-content">
          <Highlight
            text={descr}
            search={search}
            style={{ color: COLORS.GRAY }}
          />
          {code != null && code.map((v, idx) => <pre key={idx}>{v}</pre>)}
          {render_insert({ code, descr: undefined }, true)}
        </div>
      </Collapse.Panel>
    );
  }

  function render_level2([lvl2_title, data]): JSX.Element {
    // when searching, limit to the first 10 hits, otherwise all this might get too large
    const entries = search === "" ? data.entries : data.entries.slice(0, 10);
    const active_search =
      search === "" ? undefined : { activeKey: entries.map((val) => val[0]) };
    return (
      <Collapse.Panel
        key={lvl2_title}
        header={<Highlight search={search} text={lvl2_title} />}
        showArrow={active_search == null}
      >
        <Collapse
          bordered={false}
          ghost={true}
          expandIcon={({ isActive }) => (
            <CaretRightOutlined rotate={isActive ? 90 : 0} />
          )}
          className="cc-jupyter-snippet-collapse"
          {...active_search}
        >
          {entries.map(([lvl3_title, doc]) =>
            render_snippet(lvl3_title, doc, data)
          )}
        </Collapse>
      </Collapse.Panel>
    );
  }

  function render_level1([lvl1_title, entries]: [
    string,
    SnippetEntries
  ]): JSX.Element {
    const lvl2 = sortBy(Object.entries(entries), [
      ([_, v]) => v.sortweight,
      HEADER_SORTER,
    ]);
    const title_el = (
      <Highlight
        search={search}
        text={lvl1_title}
        style={{ fontWeight: "bold" }}
      />
    );
    // when searching, expand the first 3 to aid the user
    const active_search =
      search === ""
        ? undefined
        : { activeKey: lvl2.slice(0, 3).map((val) => val[0]) };

    return (
      <Collapse.Panel
        key={lvl1_title}
        header={title_el}
        className="cc-jupyter-snippets"
        showArrow={active_search == null}
      >
        <Collapse ghost destroyInactivePanel {...active_search}>
          {lvl2.map(render_level2)}
        </Collapse>
      </Collapse.Panel>
    );
  }

  const render_snippets = React.useCallback((): JSX.Element => {
    if (snippets == null) return <Loading />;
    const lvl1 = sortBy(Object.entries(snippets), [
      HEADER_SORTER,
      ([k, _]) => k,
    ]);
    const style: CSS = { overflowY: "auto" };
    // when searching, expand the first three to aid the user
    const active_search =
      search === ""
        ? undefined
        : { activeKey: lvl1.slice(0, 3).map((val) => val[0]) };
    return (
      <Collapse style={style} {...active_search}>
        {lvl1.map(render_level1)}
      </Collapse>
    );
  }, [snippets, insert_setup, search]);

  function render_help(): JSX.Element {
    return (
      <Typography.Paragraph
        type="secondary"
        ellipsis={{ rows: 1, expandable: true, symbol: "more" }}
      >
        <Typography.Text strong>Code Snippets</Typography.Text> is a collection
        of examples for the programming language{" "}
        <Typography.Text code>{lang}</Typography.Text>. Go ahead an expand the
        categories to see them and use the "{BUTTON_TEXT}" button to copy the
        snippet into your notebook.
      </Typography.Paragraph>
    );
  }

  function render_controlls(): JSX.Element {
    return (
      <Row>
        <Col flex={3}>
          <Input.Search
            addonBefore={<span style={{ paddingRight: "10px" }}>Search</span>}
            placeholder="filter..."
            allowClear
            enterButton
            onSearch={set_search}
            onChange={(e) => set_search_debounced(e.target.value)}
          />
        </Col>
        <Col flex={2}>
          <Checkbox
            style={{ padding: "5px" }}
            checked={insert_setup}
            onChange={(e) => set_insert_setup(e.target.checked)}
          >
            include setup code
          </Checkbox>
        </Col>
      </Row>
    );
  }

  function render(): JSX.Element {
    if (lang == null) return <div>Kernel not loaded.</div>;
    return (
      <>
        <div style={{ margin: "10px" }}>
          {render_help()}
          {render_controlls()}
        </div>
        {render_snippets()}
      </>
    );
  }

  return render();
});
