/*
The Menu bar across the top

File, Edit, etc....
*/

import { React, Component, rclass, rtypes, Rendered } from "../app-framework";
import { analytics_event } from "../tracker";
import * as immutable from "immutable";
import {
  ButtonGroup,
  Dropdown,
  MenuItem,
  SelectCallback
} from "react-bootstrap";
const { Icon } = require("../r_misc");
const { KeyboardShortcut } = require("./keyboard-shortcuts");
const misc_page = require("../misc_page");

import { required, defaults } from "smc-util/misc";

import { capitalize, copy, endswith } from "smc-util/misc2";

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

// const OPACITY = ".9"; // TODO: this was never read
const TITLE_STYLE: React.CSSProperties = {
  color: "#666",
  border: 0,
  backgroundColor: "rgb(247,247,247)"
};
const SELECTED_STYLE: React.CSSProperties = {
  color: "#2196F3",
  fontWeight: "bold"
};

interface TopMenubarProps {
  // OWN PROPS
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  cur_id: string;
  cells: immutable.Map<any, any>; // map from id to cells

  name: string;
  // REDUX PROPS
  // [name]
  kernels?: immutable.List<any>;
  kernel?: string;
  kernel_state?: string;
  has_unsaved_changes?: boolean;
  kernel_info?: immutable.Map<any, any>;
  backend_kernel_info?: immutable.Map<any, any>;
  trust?: boolean;
  view_mode?: string;
  toolbar?: boolean;
  cell_toolbar?: string;
  read_only?: boolean;
  // page
  fullscreen?: string;
}

export class TopMenubar0 extends Component<TopMenubarProps> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        kernels: rtypes.immutable.List,
        kernel: rtypes.string,
        kernel_state: rtypes.string,
        has_unsaved_changes: rtypes.bool,
        kernel_info: rtypes.immutable.Map,
        backend_kernel_info: rtypes.immutable.Map,
        trust: rtypes.bool,
        view_mode: rtypes.string,
        toolbar: rtypes.bool,
        cell_toolbar: rtypes.string,
        read_only: rtypes.bool
      },
      page: {
        fullscreen: rtypes.string
      }
    };
  }
  shouldComponentUpdate(nextProps) {
    return (
      nextProps.has_unsaved_changes !== this.props.has_unsaved_changes ||
      nextProps.read_only !== this.props.read_only ||
      nextProps.kernels !== this.props.kernels ||
      nextProps.kernel !== this.props.kernel ||
      nextProps.kernel_state !== this.props.kernel_state ||
      nextProps.backend_kernel_info !== this.props.backend_kernel_info ||
      nextProps.cur_id !== this.props.cur_id ||
      nextProps.cells !== this.props.cells ||
      nextProps.trust !== this.props.trust ||
      nextProps.toolbar !== this.props.toolbar ||
      nextProps.cell_toolbar !== this.props.cell_toolbar ||
      nextProps.view_mode !== this.props.view_mode
    );
  }

  render_file() {
    let script_entry: any = undefined;
    if (this.props.backend_kernel_info != null) {
      const ext = this.props.backend_kernel_info.getIn([
        "language_info",
        "file_extension"
      ]);
      if (ext != null) {
        const m = capitalize(
          this.props.backend_kernel_info.getIn(["language_info", "name"], "")
        );
        script_entry = {
          name: ">nbconvert script",
          display: `${m} (${ext})...`
        };
      }
    }
    if (script_entry === undefined) {
      script_entry = ">nbconvert script";
    }

    let trust;
    if (this.props.trust) {
      trust = { name: "<trust notebook", display: "Trusted notebook" };
    } else {
      trust = { name: "trust notebook", display: "Trust notebook..." };
    }

    let save = "save notebook";
    if (!this.props.has_unsaved_changes || this.props.read_only) {
      save = `<${save}`;
    }

    let rename = "rename notebook";
    if (this.props.has_unsaved_changes || this.props.read_only) {
      rename = `<${rename}`;
    }

    let close_and_halt = "close and halt";
    if (this.props.read_only) {
      close_and_halt = `<${close_and_halt}`;
    }

    const names = [
      "new notebook",
      "open file",
      close_and_halt,
      "",
      "duplicate notebook",
      rename,
      save,
      "time travel",
      "",
      "print preview",
      "nbconvert slides",
      "<Download as...",
      ">nbconvert ipynb",
      script_entry,
      ">nbconvert html",
      ">nbconvert markdown",
      ">nbconvert rst",
      ">nbconvert tex",
      ">nbconvert pdf",
      ">nbconvert sagews",
      ">nbconvert asciidoc",
      "",
      trust
    ];
    if (this.props.fullscreen !== "kiosk") {
      names.push("");
      names.push("switch to classical notebook");
    }

    return this.render_menu({
      heading: "File",
      names
    });
  }

  render_edit() {
    const cell_type =
      this.props.cells != null
        ? this.props.cells.getIn([this.props.cur_id, "cell_type"])
        : undefined;
    return this.render_menu({
      heading: "Edit",
      disabled: this.props.read_only,
      names: [
        "global undo",
        "global redo",
        "",
        "cut cell",
        "copy cell",
        "paste cell above",
        "paste cell below",
        "paste cell and replace",
        "delete cell",
        "",
        "split cell at cursor",
        "merge cell with previous cell",
        "merge cell with next cell",
        "merge cells",
        "",
        "move cell up",
        "move cell down",
        "",
        "write protect",
        "delete protect",
        "",
        "toggle hide input",
        "toggle hide output",
        "",
        "find and replace",
        "",
        `${cell_type !== "markdown" ? "<" : ""}insert image`
      ]
    }); // disable if not markdown
  }

  render_view() {
    if (this.props.view_mode == null) return;
    const shownb = {
      normal: ">view notebook normal",
      raw: ">view notebook raw",
      json: ">view notebook json"
    };

    shownb[this.props.view_mode] = {
      name: shownb[this.props.view_mode],
      style: SELECTED_STYLE
    };

    const toolbar = {
      name: "toggle toolbar",
      display: this.props.toolbar ? "Hide Toolbar" : "Show Toolbar"
    };

    const cell_toolbars: any = [];
    for (let name of ["none", "metadata", "slideshow", "attachments", "tags"]) {
      const item_name = `>cell toolbar ${name}`;
      if (
        (this.props.cell_toolbar != null ? this.props.cell_toolbar : "none") ===
        name
      ) {
        cell_toolbars.push({ name: item_name, style: SELECTED_STYLE });
      } else {
        cell_toolbars.push(item_name);
      }
    }

    return this.render_menu({
      heading: "View",
      disabled: this.props.read_only,
      names: [
        "toggle header",
        toolbar,
        "toggle all line numbers",
        "",
        "<Cell Toolbar..."
      ]
        .concat(cell_toolbars)
        .concat([
          "",
          "zoom in",
          "zoom out",
          "",
          "<Show Notebook as...",
          shownb.normal,
          shownb.raw,
          shownb.json
        ])
    });
  }

  render_insert() {
    return this.render_menu({
      heading: "Insert",
      names: ["insert cell above", "insert cell below"],
      min_width: "15em",
      disabled: this.props.read_only
    });
  }

  render_cell() {
    return this.render_menu({
      heading: "Cell",
      disabled: this.props.read_only,
      names: [
        "run cell",
        "run cell and select next",
        "run cell and insert below",
        "run all cells",
        "run all cells above",
        "run all cells below",
        "",
        "<Cell type...",
        ">change cell to code",
        ">change cell to markdown",
        ">change cell to raw",
        "",
        "<Selected output...",
        ">toggle cell output collapsed",
        ">toggle cell output scrolled",
        ">clear cell output",
        "",
        "<All output...",
        ">toggle all cells output collapsed",
        ">toggle all cells output scrolled",
        ">clear all cells output",
        "",
        "<Format code...",
        ">format cells",
        ">format all cells"
      ]
    });
  }

  // TODO: upper case kernel names, descriptions... and make it a new component for
  // efficiency so don't re-render if not change

  render_kernel_item(kernel: any) {
    const style: React.CSSProperties = { marginLeft: "4ex" };
    if (kernel.name === this.props.kernel) {
      style.color = "#2196F3";
      style.fontWeight = "bold";
    }
    return (
      <MenuItem
        key={kernel.name}
        eventKey={`kernel-change-${kernel.name}`}
        onSelect={() => {
          this.props.actions.set_kernel(kernel.name);
          this.focus();
          analytics_event("cocal_jupyter", "change kernel", kernel.name);
          return this.props.actions.set_default_kernel(kernel.name);
        }}
      >
        <span style={style}> {kernel.display_name} </span>
      </MenuItem>
    );
  }

  render_kernel_items() {
    if (this.props.kernels == null) {
      return;
    } else {
      const kernels = this.props.kernels.toJS();
      return kernels.map(kernel => this.render_kernel_item(kernel));
    }
  }

  render_kernel() {
    const items = this.render_kernel_items();
    const names: any[] = [
      `${this.props.kernel_state !== "busy" ? "<" : ""}interrupt kernel`,
      "confirm restart kernel",
      "confirm restart kernel and clear output",
      "confirm restart kernel and run all cells",
      "",
      "<Change kernel..."
    ]
      .concat((items as any) || [])
      .concat(["", "refresh kernels"]);

    return this.render_menu({
      heading: "Kernel",
      names,
      disabled: this.props.read_only
    });
  }

  focus() {
    $(":focus").blur(); // battling with react-bootstrap stupidity... ?
    this.props.frame_actions.focus(true);
  }

  command = (name: string): SelectCallback => {
    return () => {
      this.props.frame_actions.command(name);
      $(":focus").blur(); // battling with react-bootstrap stupidity... ?
      const c = this.props.frame_actions.commands[name];
      if (c && c.m && endswith(c.m, "...")) {
        this.props.frame_actions.blur();
      } else {
        this.focus();
      }
    };
  };

  menu_item = (key: string, name: any): Rendered => {
    if (name === "") {
      return <MenuItem key={key} divider />;
    }

    if (name.props != null) {
      return name as Rendered; // it's already a MenuItem components
    }

    let display: undefined | string;
    let style: React.CSSProperties | undefined = undefined;

    if (typeof name === "object") {
      // use {name:'>nbconvert script', display:"Executable Script (.zzz)..."}, say, to be explicit about custom name to show
      ({ name, display, style } = name);
      if (style != null) {
        style = copy(style);
      }
    } else {
      display = undefined;
    }

    if (style == null) {
      style = {};
    }

    let disabled: boolean;
    if (name[0] === "<") {
      disabled = true;
      name = name.slice(1);
    } else {
      disabled = false;
    }

    if (name[0] === ">") {
      style.marginLeft = "4ex";
      name = name.slice(1);
    }
    const obj = this.props.frame_actions.commands[name];
    if (obj == null) {
      return (
        <MenuItem disabled={disabled} key={key}>
          <span style={style}>{display != null ? display : name}</span>
        </MenuItem>
      );
    }

    let s: Rendered;
    const shortcut = obj.k != null ? obj.k[0] : undefined;
    if (shortcut != null) {
      s = (
        <span className="pull-right">
          <KeyboardShortcut shortcut={shortcut} />
        </span>
      );
    } else {
      s = <span />;
    }

    if (!display) display = obj.m;
    if (!display) display = name;

    return (
      <MenuItem key={key} onSelect={this.command(name)} disabled={disabled}>
        <span style={style}>
          {s} {display}{" "}
          {/* shortcut must be first! -- https://github.com/sagemathinc/cocalc/issues/1935 */}
        </span>
      </MenuItem>
    );
  };

  menu_items(names) {
    return (() => {
      const result: any = [];
      for (let key in names) {
        const name = names[key];
        result.push(this.menu_item(key, name));
      }
      return result;
    })();
  }

  render_menu(opts) {
    const { heading, names, opacity, min_width } = defaults(opts, {
      heading: required,
      names: required,
      opacity: 1,
      min_width: "20em",
      disabled: false
    });
    return (
      <Dropdown key={heading} id={heading} disabled={opts.disabled}>
        <Dropdown.Toggle noCaret bsStyle="default" style={TITLE_STYLE}>
          {heading}
        </Dropdown.Toggle>
        <Dropdown.Menu style={{ opacity, minWidth: min_width }}>
          {this.menu_items(names)}
        </Dropdown.Menu>
      </Dropdown>
    );
  }

  /*
render_widgets: -> # TODO: not supported in v1
  <Dropdown key='widgets' id='menu-widgets'>
      <Dropdown.Toggle noCaret bsStyle='default' style={TITLE_STYLE}>
           Widgets
      </Dropdown.Toggle>
      <Dropdown.Menu style={opacity:OPACITY}>
          <MenuItem eventKey="widgets-save-with-snapshots">Save notebook with snapshots</MenuItem>
          <MenuItem eventKey="widgets-download">Download widget state</MenuItem>
          <MenuItem eventKey="widgets-embed">Embed widgets</MenuItem>
      </Dropdown.Menu>
  </Dropdown>
*/

  links_python() {
    return {
      Python: "https://docs.python.org/2.7/",
      IPython: "http://ipython.org/documentation.html",
      Numpy: "https://docs.scipy.org/doc/numpy/reference/",
      SciPy: "https://docs.scipy.org/doc/scipy/reference/",
      Matplotlib: "http://matplotlib.org/contents.html",
      Sympy: "http://docs.sympy.org/latest/index.html",
      Pandas: "http://pandas.pydata.org/pandas-docs/stable/",
      SageMath: "http://doc.sagemath.org/"
    };
  }

  links_r() {
    return {
      R: "https://www.r-project.org/",
      "R Jupyter Kernel": "https://irkernel.github.io/faq/",
      Bioconductor: "https://www.bioconductor.org/",
      ggplot2: "http://ggplot2.org/"
    };
  }

  links_bash() {
    return {
      Bash: "https://tiswww.case.edu/php/chet/bash/bashtop.html",
      Tutorial: "http://ryanstutorials.net/linuxtutorial/"
    };
  }

  links_julia() {
    return {
      "Julia Documentation": "http://docs.julialang.org/en/stable/",
      "Gadly Plotting": "http://gadflyjl.org/stable/"
    };
  }

  links_octave() {
    return {
      Octave: "https://www.gnu.org/software/octave/",
      "Octave Documentation":
        "https://www.gnu.org/software/octave/doc/interpreter/",
      "Octave Tutorial":
        "https://en.wikibooks.org/wiki/Octave_Programming_Tutorial",
      "Octave FAQ": "http://wiki.octave.org/FAQ"
    };
  }

  links_postgresql() {
    return {
      PostgreSQL: "https://www.postgresql.org/docs/",
      "PostgreSQL Jupyter Kernel":
        "https://github.com/bgschiller/postgres_kernel"
    };
  }

  links_scala211() {
    return {
      "Scala Documentation": "https://www.scala-lang.org/documentation/"
    };
  }

  links_singular() {
    return {
      "Singular Manual": "http://www.singular.uni-kl.de/Manual/latest/index.htm"
    };
  }

  render_links() {
    const v: any = [];
    const lang =
      this.props.kernel_info != null
        ? this.props.kernel_info.get("language")
        : undefined;
    const f = this[`links_${lang}`];
    if (f != null) {
      const object = f();
      for (let name in object) {
        const url = object[name];
        v.push(external_link(name, url));
      }
    }
    return v;
  }

  render_help() {
    return (
      <Dropdown key="help" id="menu-help" className="hidden-xs">
        <Dropdown.Toggle noCaret bsStyle="default" style={TITLE_STYLE}>
          Help
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <MenuItem
            eventKey="help-about"
            onSelect={() => this.props.actions.show_about()}
          >
            <Icon name="question-circle" /> About...
          </MenuItem>
          <MenuItem divider />
          <MenuItem
            eventKey="help-keyboard"
            onClick={this.command("edit keyboard shortcuts")}
          >
            <Icon name="keyboard-o" /> Keyboard shortcuts...
          </MenuItem>
          <MenuItem divider />
          {external_link(
            "Notebook help",
            "http://nbviewer.jupyter.org/github/ipython/ipython/blob/3.x/examples/Notebook/Index.ipynb"
          )}
          {external_link(
            "Jupyter in CoCalc",
            "https://github.com/sagemathinc/cocalc/wiki/sagejupyter"
          )}
          {external_link(
            "Markdown",
            "https://help.github.com/articles/basic-writing-and-formatting-syntax"
          )}
          <MenuItem divider />
          {this.render_links()}
        </Dropdown.Menu>
      </Dropdown>
    );
  }

  render() {
    return (
      <div
        style={{
          backgroundColor: "rgb(247,247,247)",
          border: "1px solid #e7e7e7"
        }}
      >
        <ButtonGroup>
          {this.render_file()}
          {this.render_edit()}
          {this.render_view()}
          {this.render_insert()}
          {this.render_cell()}
          {this.render_kernel()}
          {this.render_help()}
        </ButtonGroup>
      </div>
    );
  }
}

export const TopMenubar = rclass(TopMenubar0);

const external_link = (name, url) => (
  <MenuItem key={name} onSelect={() => misc_page.open_new_tab(url)}>
    <Icon name="external-link" /> {name}
  </MenuItem>
);
