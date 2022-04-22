/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useEffect, useRef, useState } from "react";
import { Map as iMap, List as iList } from "immutable";
import { FileUseInfo } from "./info";
import { Alert, Button, Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { redux } from "@cocalc/frontend/app-framework";
import { SearchInput, Icon } from "@cocalc/frontend/components";
import { FileUseActions } from "./actions";
import { open_file_use_entry } from "./util";
import { search_match, search_split } from "@cocalc/util/misc";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

interface Props {
  file_use_list: iList<FileUseInfoMap>;
  user_map: iMap<string, any>;
  project_map: iMap<string, any>;
  account_id: string;
  unseen_mentions_size: number;
}

type FileUseInfoMap = iMap<string, any>;

export default function FileUseViewer({
  file_use_list,
  user_map,
  project_map,
  account_id,
  unseen_mentions_size,
}: Props) {
  const [search, setSearch] = useState<string>("");
  const [cursor, setCursor] = useState<number>(0); // cursor position
  const numMissingRef = useRef<number>(0);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const visibleListRef = useRef<iList<FileUseInfoMap> | null>(null);

  useEffect(() => {
    visibleListRef.current = null;
  }, [file_use_list, search]);

  function render_how_many_hidden_by_search() {
    get_visible_list(); // make sure num_missing is updated.
    if (numMissingRef.current == 0) return;
    return (
      <Alert
        bsStyle="warning"
        key="not_showing"
        style={{ marginBottom: "5px" }}
      >
        Hiding {numMissingRef.current} file use notifications that do not match
        search for '{search}'.
      </Alert>
    );
  }

  function set_cursor(cursor: number): void {
    if (cursor >= get_visible_list().size) {
      cursor = get_visible_list().size - 1;
    }
    if (cursor < 0) {
      cursor = 0;
    }
    setCursor(cursor);
    virtuosoRef.current?.scrollIntoView({ index: cursor });
  }

  function render_search_box() {
    return (
      <span key="search_box" className="smc-file-use-notifications-search">
        <SearchInput
          autoFocus={true}
          placeholder="Search..."
          default_value={search}
          on_change={(value) => {
            setSearch(value);
            setCursor(0);
          }}
          on_submit={() => {
            open_selected();
          }}
          on_escape={(before) => {
            if (!before) {
              const a = redux.getActions("page");
              if (a != null) {
                (a as any).toggle_show_file_use();
              }
              setCursor(0);
            }
          }}
          on_up={() => set_cursor(cursor - 1)}
          on_down={() => set_cursor(cursor + 1)}
        />
      </span>
    );
  }

  function click_mark_all_read(): void {
    const a: FileUseActions = redux.getActions("file_use");
    if (a != null) {
      a.mark_all("read");
    }
    const p = redux.getActions("page");
    if (p != null) {
      (p as any).toggle_show_file_use();
    }
  }

  function render_mark_all_read_button() {
    return (
      <Button key="mark_all_read_button" onClick={() => click_mark_all_read()}>
        <Icon name="check-square" /> Mark All Read
      </Button>
    );
  }

  function open_selected(): void {
    if (visibleListRef.current == null) return;
    const x = visibleListRef.current.get(cursor);
    if (x == null) return;
    open_file_use_entry(
      x.get("project_id"),
      x.get("path"),
      x.get("show_chat", false),
      redux
    );
  }

  function get_visible_list(): iList<FileUseInfoMap> {
    if (visibleListRef.current == null) {
      visibleListRef.current = file_use_list;
      if (search) {
        const s = search_split(search.toLowerCase());
        visibleListRef.current = visibleListRef.current.filter((info) =>
          search_match(info.get("search"), s)
        );
        numMissingRef.current =
          file_use_list.size - visibleListRef.current.size;
      } else {
        numMissingRef.current = 0;
      }
      if (visibleListRef.current == null) throw new Error("bug");
    }
    return visibleListRef.current;
  }

  function row_renderer(index) {
    const info = get_visible_list().get(index);
    if (info == null) {
      // shouldn't happen
      return <div style={{ height: "1px" }}></div>;
    }
    return (
      <FileUseInfo
        key={`${index}`}
        cursor={index === cursor}
        redux={redux}
        info={info}
        account_id={account_id}
        user_map={user_map}
        project_map={project_map}
      />
    );
  }

  function render_see_mentions_link() {
    let notifications_page_text:
      | string
      | JSX.Element = `Mentions (${unseen_mentions_size})`;
    if (unseen_mentions_size > 0) {
      notifications_page_text = <b>{notifications_page_text}</b>;
    }
    return (
      <Link
        style={{ fontSize: "16px", whiteSpace: "nowrap" }}
        on_click={() => {
          redux.getActions("page").set_active_tab("notifications");
          redux.getActions("page").toggle_show_file_use();
        }}
      >
        {notifications_page_text}
      </Link>
    );
  }

  const link = render_see_mentions_link();
  return (
    <div className={"smc-vfill smc-file-use-viewer"}>
      <Row key="top" style={{ marginBottom: "5px" }}>
        <Col sm={7}>{render_search_box()}</Col>
        <Col sm={2} style={{ paddingTop: "5px" }}>
          {link}
        </Col>
        <Col sm={3}>
          <div style={{ float: "right" }}>{render_mark_all_read_button()}</div>
        </Col>
      </Row>
      {render_how_many_hidden_by_search()}
      <Virtuoso
        ref={virtuosoRef}
        totalCount={get_visible_list().size}
        itemContent={row_renderer}
      />
    </div>
  );
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
