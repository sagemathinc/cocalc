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
import { sortBy, debounce, isEmpty } from "lodash";
import { JupyterEditorActions } from "../actions";
import { JupyterStore } from "../../../jupyter/store";
import { NotebookFrameStore } from "../cell-notebook/store";
import { A, Loading } from "../../../r_misc";
import { COLORS } from "smc-util/theme";
import {
  Button,
  Collapse,
  Checkbox,
  Typography,
  Input,
  Row,
  Col,
  Alert,
} from "antd";
import {
  CaretRightOutlined,
  PlusSquareOutlined,
  MinusSquareOutlined,
  LeftSquareOutlined,
} from "@ant-design/icons";

import { SnippetDoc, SnippetEntry, SnippetEntries, Snippets } from "./types";
import { filter_snippets, generate_setup_code } from "./utils";
import { Copy, Highlight } from "./components";

const URL = "https://github.com/sagemathinc/cocalc-snippets";
const BUTTON_TEXT = "pick";
const HEADER_SORTER = ([k, _]) =>
  -["Introduction", "Tutorial", "Help"].indexOf(k);

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

interface Props {
  font_size: number;
  project_id: string;
  actions: JupyterEditorActions;
  local_view_state: Map<string, any>;
}

export const JupyterSnippets: React.FC<Props> = React.memo((props: Props) => {
  const {
    font_size,
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
  const [search_txt, set_search_txt] = useState("");
  const [search, set_search] = useState("");
  const set_search_debounced = debounce(set_search, 333);
  const data = useData();

  useEffect(() => {
    set_search_debounced(search_txt);
  }, [search_txt]);

  // get_kernel_language() depends on kernel and kernel_info
  useEffect(() => {
    const next_lang = jupyter_store.get_kernel_language();
    if (next_lang != lang) set_lang(next_lang);
  }, [kernel, kernel_info]);

  // recompute snippets when data, the kernel language or the search string changes
  const snippets = useMemo(() => {
    if (data == null || lang == null) return;
    const raw = data[lang];
    if (raw == null) return;
    // we also pass the raw data through the filter if the string is empty,
    // such that no headers without any data do not show up
    return filter_snippets(raw, search);
  }, [data, lang, search]);

  // we need to know the target frame of the jupyter notebook
  useEffect(() => {
    const jid = frame_actions._get_most_recent_active_frame_id_of_type(
      "jupyter_cell_notebook"
    );
    if (jid == null) return;
    if (jupyter_id != jid) set_jupyter_id(jid);
  }, [local_view_state]);

  // this is the core part of this: upon user request, the select part of the snippets
  // data-structure is inserted into the notebook + evaluated
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

  // either a button to pick a snippet or just an insert link
  function render_insert({ code, descr }, link = false) {
    if (!code) return;
    const text = link ? "insert code" : BUTTON_TEXT;
    return (
      <Button
        size={"small"}
        icon={<LeftSquareOutlined />}
        type={link ? "link" : "default"}
        onClick={(e) => {
          insert_snippet({ code, descr });
          e.stopPropagation();
        }}
      >
        {text}
      </Button>
    );
  }

  // the actual snippet
  function render_snippet(
    lvl3_title: string,
    doc: SnippetDoc[1],
    data: SnippetEntry
  ) {
    // if there is no code (empty string) → undefined
    // otherwise make sure this is string[]
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
          <Row>
            <Col flex={3}>
              {render_insert({ code, descr: undefined }, true)}
            </Col>
            <Col flex={1} style={{ textAlign: "right" }}>
              <Copy code={code} />
            </Col>
          </Row>
        </div>
      </Collapse.Panel>
    );
  }

  // this iterates over all subheaders to render each snippet
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

  // for each section, iterate over all headers
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

  function render_no_kernel(): JSX.Element {
    return (
      <Alert
        message="No kernel"
        type="info"
        description="There is no active kernel and therefore the programming language is not known."
      />
    );
  }

  function render_no_snippets(): JSX.Element {
    return (
      <Alert
        message="No Snippets"
        type="error"
        description={
          <div>
            There are no snippets known for the programming language {lang}. You
            can help by <A href={URL}>contributing snippets</A>.
          </div>
        }
      />
    );
  }

  function render_loading(): JSX.Element {
    return (
      <div style={{ textAlign: "center", marginTop: "5rem" }}>
        <Loading />
      </div>
    );
  }

  function no_search_result(): JSX.Element {
    return (
      <Alert
        message="No search results"
        type="info"
        description={
          <>
            There are no matches for your search.{" "}
            <Button type="link" onClick={() => set_search_txt("")}>
              clear search
            </Button>
          </>
        }
      />
    );
  }

  // memoizes the actually rendered snippet (depends only on a few details)
  const render_snippets = React.useCallback((): JSX.Element => {
    if (data == null) return render_loading();
    if (lang == null) return render_no_kernel();
    if (snippets == null) return render_no_snippets();
    if (search !== "" && isEmpty(snippets)) return no_search_result();
    const lvl1 = sortBy(Object.entries(snippets), [
      HEADER_SORTER,
      ([k, _]) => k,
    ]);
    const style: CSS = {
      overflowY: "auto",
      border: "0",
      fontSize: `${font_size}px`,
    };
    // when searching, expand the first three to aid the user
    const active_search =
      search === ""
        ? undefined
        : { activeKey: lvl1.slice(0, 3).map((val) => val[0]) };
    return (
      <Collapse
        style={style}
        expandIcon={({ isActive }) => {
          const style: CSS = { fontSize: "1em" };
          if (isActive) {
            return <MinusSquareOutlined style={style} />;
          } else {
            return <PlusSquareOutlined style={style} />;
          }
        }}
        {...active_search}
      >
        {lvl1.map(render_level1)}
      </Collapse>
    );
  }, [snippets, insert_setup, search, font_size]);

  // introduction at the top
  function render_help(): JSX.Element {
    return (
      <Typography.Paragraph
        type="secondary"
        ellipsis={{ rows: 1, expandable: true, symbol: "more" }}
      >
        <Typography.Text strong>Code Snippets</Typography.Text> is a collection
        of examples for the current programming language. Go ahead and expand
        the categories to see them and use the "{BUTTON_TEXT}" button to copy
        the snippet into your notebook. If there is some text in the search box,
        it shows you some of the matching snippets. Something missing? Please{" "}
        <A href={URL}>contribute snippets</A>.
      </Typography.Paragraph>
    );
  }

  // search box and if user also wants to insert the setup cells
  function render_controlls(): JSX.Element {
    const onChange = (e) => {
      const txt = e.target.value;
      set_search_txt(txt);
    };

    return (
      <Row>
        <Col flex={3}>
          <Input.Search
            value={search_txt}
            addonBefore={<span style={{ paddingRight: "10px" }}>Search</span>}
            placeholder="filter..."
            allowClear
            enterButton
            onSearch={set_search}
            onChange={onChange}
          />
        </Col>
        <Col flex={2}>
          <Checkbox
            style={{ padding: "5px", fontWeight: "normal" }}
            checked={insert_setup}
            onChange={(e) => set_insert_setup(e.target.checked)}
          >
            include setup code
          </Checkbox>
        </Col>
      </Row>
    );
  }

  return (
    <>
      <div style={{ margin: "10px", fontSize: `${font_size}px` }}>
        {render_help()}
        {render_controlls()}
      </div>
      {render_snippets()}
    </>
  );
});
