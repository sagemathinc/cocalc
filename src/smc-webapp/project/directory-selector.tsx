/*
Component that allows a user to select a directory in a project.

- [ ] text box to filter what is shown (?)
*/

import { Map, Set } from "immutable";
import {
  Rendered,
  Component,
  React,
  rclass,
  redux,
  rtypes,
  project_redux_name,
} from "../app-framework";

import { Icon } from "../r_misc";
import { path_split, startswith } from "smc-util/misc2";
import { exec } from "../frame-editors/generic/client";
import { alert_message } from "../alerts";
import { callback2 } from "smc-util/async-utils";
import { delay } from "awaiting";

const DEFAULT_STYLE: React.CSSProperties = {
  maxHeight: "250px",
  width: "20em",
  overflow: "scroll",
  backgroundColor: "white",
  padding: "5px",
  border: "1px solid lightgrey",
  borderRadius: "3px",
  whiteSpace: "nowrap",
};

interface Props {
  project_id: string;
  starting_path?: string;
  exclusions?: string[]; // grey these directories out; should not be available to select.  Relative to home directory.
  onSelect: Function; // called when user chooses a directory
  onCancel?: Function;

  // reduxProps
  directory_listings?: Map<string, any>;
}

interface State {
  current_path: string;
  selected_path?: string;
  expanded_paths: Set<string>; // paths that are expanded
  edit_path: string; // path whose name is being edited
  edited_name: string;
  show_hidden: boolean;
}

class DirectorySelector extends Component<Props, State> {
  private is_mounted: boolean = true;
  componentWillUnmount() {
    this.is_mounted = false;
  }

  constructor(props) {
    super(props);
    const current_path = props.starting_path ?? "";
    const expanded_paths: string[] = [""];
    if (current_path != "") {
      const v = current_path.split("/");
      let path = v[0];
      expanded_paths.push(path);
      for (let i = 1; i < v.length; i++) {
        path += "/" + v[i];
        expanded_paths.push(path);
      }
    }
    this.state = {
      current_path,
      expanded_paths: Set(expanded_paths),
      show_hidden: false,
      edit_path: "",
      edited_name: "",
    };
  }

  static reduxProps({ project_id }) {
    return {
      [project_redux_name(project_id)]: {
        directory_listings: rtypes.immutable.Map,
      },
    };
  }

  private select_path(selected_path: string): void {
    this.setState({ selected_path });
    this.props.onSelect(selected_path);
  }

  private render_selectable_path(path: string, tail: string): Rendered {
    const is_selected: boolean = this.state.selected_path == path;
    const is_editable: boolean =
      (path != "" || tail != "") && this.state.edit_path == path;
    let content: Rendered;
    if (!is_editable) {
      content = <>{tail ? tail : "Home directory"}</>;
    } else {
      content = (
        <input
          type="text"
          value={this.state.edited_name}
          autoFocus
          style={{ width: "10em", border: 0, padding: "0 5px" }}
          onChange={(event) =>
            this.setState({ edited_name: event.target.value })
          }
          onBlur={() => this.rename_folder()}
          onKeyUp={(event) => {
            switch (event.keyCode) {
              case 27:
                this.cancel_edit_name();
                return;
              case 13:
                this.rename_folder();
                return;
            }
          }}
        />
      );
    }

    return (
      <span
        style={{
          cursor: "pointer",
          display: "inline-block",
          width: "10em",
          overflowX: "hidden",
          textOverflow: "ellipsis",
          padding: "0 5px",
          whiteSpace: "nowrap",
          backgroundColor: !is_editable && is_selected ? "#40a9ff" : undefined,
          color: !is_editable && is_selected ? "white" : undefined,
        }}
        onClick={() => this.select_path(path)}
        onDoubleClick={() => this.edit_name(path)}
      >
        {content}
      </span>
    );
  }

  private edit_name(edit_path: string): void {
    this.setState({ edit_path, edited_name: path_split(edit_path).tail });
  }

  private cancel_edit_name(): void {
    this.setState({ edit_path: "", edited_name: "" });
  }

  private async rename_folder(): Promise<void> {
    const edit_path = this.state.edit_path;
    const { head, tail } = path_split(edit_path);
    const edited_name = this.state.edited_name;
    this.cancel_edit_name();
    if (edited_name == tail) return; // no-op
    // TODO: this changes with my client.coffee rewrite!?
    try {
      await exec({
        command: "mv",
        path: head,
        args: [tail, edited_name],
        project_id: this.props.project_id,
      });
      if (!this.is_mounted) return;
    } catch (err) {
      if (!this.is_mounted) return;
      alert_message({ type: "error", message: err.toString() });
    }
  }

  private render_directory(path: string): Rendered {
    const is_expanded: boolean = this.state.expanded_paths.has(path);
    const { tail } = path_split(path);
    if (!is_expanded) {
      return (
        <div key={path}>
          <Icon
            style={{ cursor: "pointer", verticalAlign: "top" }}
            name="angle-right"
            onClick={() => {
              this.expand(path);
            }}
          />{" "}
          {this.render_selectable_path(path, tail)}
        </div>
      );
    } else {
      return (
        <div key={path}>
          <div>
            <Icon
              style={{ cursor: "pointer", verticalAlign: "top" }}
              name="angle-down"
              onClick={() => {
                this.unexpand(path);
              }}
            />{" "}
            {this.render_selectable_path(path, tail)}
          </div>
          <div style={{ marginLeft: "2em" }}>{this.render_subdirs(path)}</div>
        </div>
      );
    }
  }

  private expand(path: string): void {
    this.setState({ expanded_paths: this.state.expanded_paths.add(path) });
  }

  private unexpand(path: string): void {
    this.setState({ expanded_paths: this.state.expanded_paths.remove(path) });
  }

  private async fetch_directory_listing(path: string): Promise<void> {
    // must happen in a different render loop, hence the delay
    await delay(0);
    redux
      .getProjectActions(this.props.project_id)
      .fetch_directory_listing({ path });
  }

  private render_subdirs(path: string): Rendered {
    const v = this.props.directory_listings?.get(path)?.toJS();
    if (v == null) {
      this.fetch_directory_listing(path);
      return;
    } else {
      const w: Rendered[] = [];
      const base = path == "" ? "" : path + "/";
      for (const x of v) {
        if (x?.isdir) {
          if (startswith(x.name, ".") && !this.state.show_hidden) continue;
          w.push(this.render_directory(base + x.name));
        }
      }
      w.push(this.render_create_directory(path));
      return <div key={path}>{w}</div>;
    }
  }

  private async path_exists(path: string): Promise<boolean> {
    const { head, tail } = path_split(path);
    let known = this.props.directory_listings?.get(head);
    if (known == null) {
      const actions = redux.getProjectActions(this.props.project_id);
      await callback2(actions.fetch_directory_listing.bind(actions), {
        path: head,
      });
    }
    known = this.props.directory_listings?.get(head);
    if (known == null) {
      return false;
    }
    for (const x of known) {
      if (x.get("name") == tail) return true;
    }
    return false;
  }

  private async create_directory(path: string): Promise<string> {
    let target = path + (path != "" ? "/" : "") + "New directory";
    if (await this.path_exists(target)) {
      let i: number = 1;
      while (await this.path_exists(target + ` (${i})`)) {
        i += 1;
      }
      target += ` (${i})`;
      if (!this.is_mounted) return "";
    }
    try {
      await exec({
        command: "mkdir",
        args: ["-p", target],
        project_id: this.props.project_id,
      });
      return target;
    } catch (err) {
      alert_message({ type: "error", message: err.toString() });
      return "";
    }
  }

  private render_create_directory(path: string): Rendered {
    return (
      <div
        style={{ cursor: "pointer" }}
        key={"...-create-dir"}
        onClick={async () => {
          const target = await this.create_directory(path);
          if (this.is_mounted && target) {
            this.edit_name(target);
          }
        }}
      >
        <Icon style={{ verticalAlign: "top" }} name="plus" /> New directory
      </div>
    );
  }

  private render_hidden(): Rendered {
    return (
      <div
        style={{
          cursor: "pointer",
          borderTop: "1px solid lightgrey",
          marginTop: "5px",
        }}
        onClick={() => {
          this.setState({ show_hidden: !this.state.show_hidden });
        }}
      >
        <Icon name={this.state.show_hidden ? "check-square-o" : "square-o"} />{" "}
        Show hidden directories
      </div>
    );
  }

  public render(): Rendered {
    return (
      <div style={DEFAULT_STYLE}>
        {this.render_selectable_path("", "")}
        <div style={{ marginLeft: "2em" }}>{this.render_subdirs("")}</div>
        {this.render_hidden()}
      </div>
    );
  }
}

const tmp = rclass(DirectorySelector);
export { tmp as DirectorySelector };
