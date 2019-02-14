import { Map as iMap, List as iList } from "immutable";

import { FileUseInfo } from "./info";

const { Button, Col, Row } = require("react-bootstrap");

import { Component, React, Rendered } from "../app-framework";

import { analytics_event } from "../tracker";

const { Icon, SearchInput } = require("../r_misc");

import { FileUseActions } from "./actions";

import { open_file_use_entry } from "./util";

const { filename_extension, search_match, search_split } = require("smc-util/misc");

// Number of notifications to show if "Show All" isn't clicked
const SHORTLIST_LENGTH = 40;

interface Props {
  redux: any;
  file_use_list: iList<any>;
  user_map: iMap<string, any>;
  project_map: iMap<string, any>;
  account_id: string;
}

interface State {
  search: string;
  cursor: number; // cursor position
  show_all: boolean;
}

export class FileUseViewer extends Component<Props, State> {
  private _visible_list: iMap<string, any>[] = [];
  private _num_missing: number = 0;

  constructor(props) {
    super(props);
    this.state = {
      search: "",
      cursor: 0,
      show_all: false
    };
  }

  render_search_box(): Rendered {
    return (
      <span key="search_box" className="smc-file-use-notifications-search">
        <SearchInput
          autoFocus={true}
          placeholder="Search..."
          default_value={this.state.search}
          on_change={value =>
            this.setState({ search: value, cursor: 0, show_all: false })
          }
          on_submit={() => {
            this.open_selected();
          }}
          on_escape={before => {
            if (!before) {
              const a = this.props.redux.getActions("page");
              if (a != null) {
                (a as any).toggle_show_file_use();
              }
              this.setState({ cursor: 0, show_all: false });
            }
          }}
          on_up={() =>
            this.setState({ cursor: Math.max(0, this.state.cursor - 1) })
          }
          on_down={() => {
            const cursor = Math.max(
              0,
              Math.min(this._visible_list.length - 1, this.state.cursor + 1)
            );
            this.setState({ cursor });
          }}
        />
      </span>
    );
  }

  click_mark_all_read(): void {
    const a: FileUseActions = this.props.redux.getActions("file_use");
    if (a != null) {
      a.mark_all("read");
    }
    const p = this.props.redux.getActions("page");
    if (p != null) {
      (p as any).toggle_show_file_use();
    }
  }

  render_mark_all_read_button(): Rendered {
    return (
      <Button
        key="mark_all_read_button"
        onClick={() => this.click_mark_all_read()}
      >
        <Icon name="check-square" /> Mark All Read
      </Button>
    );
  }

  open_selected(): void {
    if (this._visible_list == null) return;
    const x = this._visible_list[this.state.cursor];
    if (x == null) return;
    open_file_use_entry(
      x.get("project_id"),
      x.get("path"),
      x.get("show_chat", false),
      this.props.redux
    );
    analytics_event(
      "file_notifications",
      "open from search",
      filename_extension(x.get("path"))
    );
  }

  render_list(): Rendered[] {
    let v = this.props.file_use_list.toArray();
    if (this.state.search) {
      const s = search_split(this.state.search.toLowerCase());
      const w: any[] = [];
      for (let x of v) {
        if (x && search_match(x.get("search"), s)) {
          w.push(x);
        }
      }
      v = w;
    }
    if (!this.state.show_all) {
      this._num_missing = Math.max(0, v.length - SHORTLIST_LENGTH);
      v = v.slice(0, SHORTLIST_LENGTH);
    }
    this._visible_list = v;
    const r: Rendered[] = [];
    for (let i = 0; i < v.length; i++) {
      const info = v[i];
      r.push(
        <FileUseInfo
          key={`file-use-${i}`}
          cursor={i === this.state.cursor}
          redux={this.props.redux}
          info={info}
          account_id={this.props.account_id}
          user_map={this.props.user_map}
          project_map={this.props.project_map}
        />
      );
    }
    return r;
  }

  render_show_all(): Rendered {
    if (this._num_missing) {
      return (
        <Button
          key="show_all"
          onClick={e => {
            e.preventDefault();
            return this.setState({ show_all: true });
          }}
        >
          Show {this._num_missing} More
        </Button>
      );
    }
  }

  render_show_less(): Rendered {
    const n = this._visible_list.length - SHORTLIST_LENGTH;
    if (n > 0) {
      return (
        <Button
          key="show_less"
          onClick={e => {
            e.preventDefault();
            return this.setState({ show_all: false });
          }}
        >
          Show {n} Less
        </Button>
      );
    }
  }

  render_toggle_all(): Rendered {
    return (
      <div key="toggle_all" style={{ textAlign: "center", marginTop: "2px" }}>
        {this.state.show_all ? this.render_show_less() : this.render_show_all()}
      </div>
    );
  }

  render(): Rendered {
    return (
      <div className={"smc-file-use-viewer"}>
        <Row key="top">
          <Col sm={7}>{this.render_search_box()}</Col>
          <Col sm={5}>
            <div style={{ float: "right" }}>
              {this.render_mark_all_read_button()}
            </div>
          </Col>
        </Row>
        {this.render_list()}
        {this.render_toggle_all()}
      </div>
    );
  }
}
