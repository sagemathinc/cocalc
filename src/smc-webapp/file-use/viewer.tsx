/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map as iMap, List as iList } from "immutable";
import { FileUseInfo } from "./info";
import { Alert, Button, Col, Row } from "react-bootstrap";
import { Component, React, Rendered } from "../app-framework";
import { SearchInput, WindowedList, Icon } from "../r_misc";
import { FileUseActions } from "./actions";
import { open_file_use_entry } from "./util";

const {
  search_match,
  search_split,
} = require("smc-util/misc");

interface Props {
  redux: any;
  file_use_list: iList<FileUseInfoMap>;
  user_map: iMap<string, any>;
  project_map: iMap<string, any>;
  account_id: string;
  unseen_mentions_size: number;
}

interface State {
  search: string;
  cursor: number; // cursor position
}

type FileUseInfoMap = iMap<string, any>;

export class FileUseViewer extends Component<Props, State> {
  private num_missing: number = 0;
  private windowed_list_ref = React.createRef<WindowedList>();
  private visible_list: iList<FileUseInfoMap> | undefined = undefined;

  constructor(props) {
    super(props);
    this.state = {
      search: "",
      cursor: 0,
    };
  }

  public shouldComponentUpdate(nextProps: Props, nextState: State): boolean {
    if (
      this.props.file_use_list != nextProps.file_use_list ||
      this.state.search != nextState.search
    ) {
      delete this.visible_list;
      return true;
    }
    return (
      this.props.unseen_mentions_size != nextProps.unseen_mentions_size ||
      this.state.cursor != nextState.cursor ||
      this.props.user_map != nextProps.user_map ||
      this.props.project_map != nextProps.project_map
    );
  }

  render_how_many_hidden_by_search(): Rendered {
    this.get_visible_list(); // make sure num_missing is updated.
    if (this.num_missing == 0) return;
    return (
      <Alert bsStyle="warning" key="not_showing">
        Hiding {this.num_missing} file use notifications that do not match
        search for '{this.state.search}'.
      </Alert>
    );
  }

  private set_cursor(cursor: number): void {
    if (cursor >= this.get_visible_list().size) {
      cursor = this.get_visible_list().size - 1;
    }
    if (cursor < 0) {
      cursor = 0;
    }
    this.setState({ cursor });
    if (this.windowed_list_ref.current != null) {
      this.windowed_list_ref.current.scrollToRow(cursor);
    }
  }

  render_search_box(): Rendered {
    return (
      <span key="search_box" className="smc-file-use-notifications-search">
        <SearchInput
          autoFocus={true}
          placeholder="Search..."
          default_value={this.state.search}
          on_change={(value) => this.setState({ search: value, cursor: 0 })}
          on_submit={() => {
            this.open_selected();
          }}
          on_escape={(before) => {
            if (!before) {
              const a = this.props.redux.getActions("page");
              if (a != null) {
                (a as any).toggle_show_file_use();
              }
              this.setState({ cursor: 0 });
            }
          }}
          on_up={() => this.set_cursor(this.state.cursor - 1)}
          on_down={() => this.set_cursor(this.state.cursor + 1)}
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
    if (this.visible_list == null) return;
    const x = this.visible_list.get(this.state.cursor);
    if (x == null) return;
    open_file_use_entry(
      x.get("project_id"),
      x.get("path"),
      x.get("show_chat", false),
      this.props.redux
    );
  }

  private get_visible_list(): iList<FileUseInfoMap> {
    if (this.visible_list == null) {
      this.visible_list = this.props.file_use_list;
      if (this.state.search) {
        const s = search_split(this.state.search.toLowerCase());
        this.visible_list = this.visible_list.filter((info) =>
          search_match(info.get("search"), s)
        );
        this.num_missing =
          this.props.file_use_list.size - this.visible_list.size;
      } else {
        this.num_missing = 0;
      }
      if (this.visible_list == null) throw new Error("bug");
    }
    return this.visible_list;
  }

  private row_key(index: number): string {
    return `${index}`;
  }

  private row_renderer({ index }): Rendered {
    const info = this.get_visible_list().get(index);
    if (info == null) return;
    return (
      <FileUseInfo
        cursor={index === this.state.cursor}
        redux={this.props.redux}
        info={info}
        account_id={this.props.account_id}
        user_map={this.props.user_map}
        project_map={this.props.project_map}
      />
    );
  }

  private render_list(): Rendered {
    return (
      <WindowedList
        ref={this.windowed_list_ref}
        overscan_row_count={20}
        estimated_row_size={56}
        row_count={this.get_visible_list().size}
        row_renderer={this.row_renderer.bind(this)}
        row_key={this.row_key.bind(this)}
        cache_id={"file-use"}
      />
    );
  }

  render_see_mentions_link(): Rendered {
    let notifications_page_text:
      | string
      | JSX.Element = `Mentions (${this.props.unseen_mentions_size})`;
    if (this.props.unseen_mentions_size > 0) {
      notifications_page_text = <b>{notifications_page_text}</b>;
    }
    return (
      <Link
        style={{ fontSize: "16px", whiteSpace: "nowrap" }}
        on_click={() => {
          this.props.redux.getActions("page").set_active_tab("notifications");
          this.props.redux.getActions("page").toggle_show_file_use();
        }}
      >
        {notifications_page_text}
      </Link>
    );
  }

  render(): Rendered {
    const link = this.render_see_mentions_link();
    return (
      <div className={"smc-vfill smc-file-use-viewer"}>
        <Row key="top">
          <Col sm={7}>{this.render_search_box()}</Col>
          <Col sm={2} style={{ paddingTop: "5px" }}>
            {link}
          </Col>
          <Col sm={3}>
            <div style={{ float: "right" }}>
              {this.render_mark_all_read_button()}
            </div>
          </Col>
        </Row>
        {this.render_how_many_hidden_by_search()}
        {this.render_list()}
      </div>
    );
  }
}

function Link({ on_click, children, style }) {
  const _on_click = (e) => {
    e.preventDefault();
    on_click(e);
  };

  return (
    <a role="button" href="" onClick={_on_click} style={style}>
      {children}{" "}
    </a>
  );
}
