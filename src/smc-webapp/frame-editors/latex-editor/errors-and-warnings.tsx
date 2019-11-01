/*
Show errors and warnings.
*/

import { Map } from "immutable";
import { capitalize, is_different, path_split } from "smc-util/misc2";
import {
  Component,
  React,
  rclass,
  rtypes,
  Rendered
} from "../../app-framework";
import { TypedMap } from "../../app-framework/TypedMap";

import { BuildLogs } from "./actions";

const { Icon, Loading } = require("smc-webapp/r_misc");

function group_to_level(group: string): string {
  switch (group) {
    case "errors":
      return "error";
    case "warnings":
      return "warning";
    default:
      return group;
  }
}

export interface SpecItem {
  icon: string;
  color: string;
}

export interface SpecDesc {
  error: SpecItem;
  typesetting: SpecItem;
  warning: SpecItem;
}

export const SPEC: SpecDesc = {
  error: {
    icon: "bug",
    color: "#a00"
  },
  typesetting: {
    icon: "exclamation-circle",
    color: "rgb(66, 139, 202)"
  },
  warning: {
    icon: "exclamation-triangle",
    color: "#fdb600"
  }
};

const ITEM_STYLES = {
  warning: {
    borderLeft: `2px solid ${SPEC.warning.color}`,
    padding: "15px",
    margin: "5px 0"
  },
  error: {
    borderLeft: `2px solid ${SPEC.error.color}`,
    padding: "15px",
    margin: "5px 0"
  },
  typesetting: {
    borderLeft: `2px solid ${SPEC.typesetting.color}`,
    padding: "15px",
    margin: "5px 0"
  }
};

interface item {
  line: string;
  file?: string;
  level: number;
  message?: string;
  content?: string;
}

interface ItemProps {
  actions: any;
  item: TypedMap<item>;
}

class Item extends Component<ItemProps, {}> {
  shouldComponentUpdate(props: ItemProps): boolean {
    return this.props.item !== props.item;
  }

  edit_source(e: React.SyntheticEvent<any>): void {
    e.stopPropagation();
    const line: number = parseInt(this.props.item.get("line"));
    const filename = this.props.item.get("file");
    if (!filename) return;
    this.props.actions.open_code_editor({
      line: line,
      file: filename,
      cursor: true,
      focus: true,
      direction: "col"
    });
    this.props.actions.synctex_tex_to_pdf(line, 0, filename);
  }

  render_location(): React.ReactElement<any> | undefined {
    if (!this.props.item.get("line")) {
      return;
    }
    // https://github.com/sagemathinc/cocalc/issues/3413
    const file = this.props.item.get("file");

    if (file) {
      return (
        <div>
          <a
            onClick={e => this.edit_source(e)}
            style={{ cursor: "pointer", float: "right" }}
          >
            Line {this.props.item.get("line")} of {path_split(file).tail}
          </a>
        </div>
      );
    } else {
      return <div>Line {this.props.item.get("line")}</div>;
    }
  }

  render_message(): React.ReactElement<any> | undefined {
    const message = this.props.item.get("message");
    if (!message) {
      return;
    }
    return <div>{message}</div>;
  }

  render_content(): React.ReactElement<any> | undefined {
    const content = this.props.item.get("content");
    if (!content) {
      return;
    }
    return <pre>{content}</pre>;
  }

  render(): React.ReactElement<any> {
    return (
      <div style={ITEM_STYLES[this.props.item.get("level")]}>
        {this.render_location()}
        {this.render_message()}
        {this.render_content()}
      </div>
    );
  }
}

interface ErrorsAndWarningsProps {
  id: string;
  actions: any;
  editor_state: Map<string, any>;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  reload: number;
  font_size: number;

  // reduxProps:
  build_logs: BuildLogs;
  status: string;
  knitr: boolean;
}

class ErrorsAndWarnings extends Component<ErrorsAndWarningsProps, {}> {
  static defaultProps = { build_logs: Map<string, any>(), status: "" };

  static reduxProps({ name }) {
    return {
      [name]: {
        build_logs: rtypes.immutable.Map,
        status: rtypes.string,
        knitr: rtypes.bool
      }
    };
  }

  shouldComponentUpdate(props): boolean {
    return (
      is_different(this.props, props, ["status", "font_size", "knitr"]) ||
      this.props.build_logs.getIn(["latex", "parse"]) !=
        props.build_logs.getIn(["latex", "parse"]) ||
      this.props.build_logs.getIn(["knitr", "parse"]) !=
        props.build_logs.getIn(["knitr", "parse"]) ||
      this.props.build_logs.getIn(["pythontex", "parse"]) !=
        props.build_logs.getIn(["pythontex", "parse"]) ||
      this.props.build_logs.getIn(["sagetex", "parse"]) !=
        props.build_logs.getIn(["sagetex", "parse"])
    );
  }

  render_status(): Rendered {
    if (this.props.status) {
      return (
        <div
          style={{
            margin: "5px",
            right: 0,
            background: "white",
            paddingLeft: "5px"
          }}
        >
          <Loading
            text={this.props.status}
            style={{
              fontSize: "10pt",
              color: "#666"
            }}
          />
        </div>
      );
    }
  }

  render_item(item, key): Rendered {
    return <Item key={key} item={item} actions={this.props.actions} />;
  }

  render_group_content(content): Rendered {
    if (content.size === 0) {
      return <div>None</div>;
    } else {
      const w: Rendered[] = [];
      content.forEach(item => {
        w.push(this.render_item(item, w.length));
      });
      return <div>{w}</div>;
    }
  }

  render_group(tool: string, group: string): Rendered {
    if (tool == "knitr" && !this.props.knitr) {
      return undefined;
    }
    const spec: SpecItem = SPEC[group_to_level(group)];
    const content = this.props.build_logs.getIn([tool, "parse", group]);
    if (!content) {
      return;
    }
    const header = (
      <>
        <Icon name={spec.icon} style={{ color: spec.color }} />{" "}
        {capitalize(group)} ({capitalize(tool)})
      </>
    );
    return (
      <div key={group}>
        {content.size == 0 ? <h5>{header}</h5> : <h3>{header}</h3>}
        {this.render_group_content(content)}
      </div>
    );
  }

  render_hint(): Rendered {
    if (this.props.status || this.props.build_logs.size > 0) {
      return;
    }
    return (
      <div style={{ color: "#666" }}>
        Click the <Icon name="play-circle" /> Build button or hit shift+enter to
        run LaTeX.
      </div>
    );
  }

  render(): React.ReactElement<any> {
    return (
      <div
        className={"smc-vfill"}
        style={{
          overflowY: "scroll",
          padding: "5px 15px",
          fontSize: "10pt"
        }}
      >
        {this.render_hint()}
        {this.render_status()}
        {["errors", "typesetting", "warnings"].map(group =>
          this.render_group("latex", group)
        )}
        {this.render_group("sagetex", "errors")}
        {["errors", "warnings"].map(group => this.render_group("knitr", group))}
        {this.render_group("pythontex", "errors")}
      </div>
    );
  }
}

const tmp = rclass(ErrorsAndWarnings);
export { tmp as ErrorsAndWarnings };
