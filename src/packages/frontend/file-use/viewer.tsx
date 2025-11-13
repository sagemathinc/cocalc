/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { List as iList, Map as iMap } from "immutable";
import { useEffect, useRef, useState } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { Alert, Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { redux } from "@cocalc/frontend/app-framework";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import {
  MarkAll,
  SearchInput,
  Title,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import { search_match, search_split } from "@cocalc/util/misc";
import { FileUseActions } from "./actions";
import { FileUseInfo } from "./info";
import { open_file_use_entry } from "./util";

interface Props {
  file_use_list: iList<FileUseInfoMap>;
  user_map: iMap<string, any>;
  project_map: iMap<string, any>;
  account_id: string;
}

type FileUseInfoMap = iMap<string, any>;

export default function FileUseViewer({
  file_use_list,
  user_map,
  project_map,
  account_id,
}: Props) {
  const [search, _setSearch] = useState<string>("");
  const [cursor, setCursor] = useState<number>(0); // cursor position
  const numMissingRef = useRef<number>(0);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const visibleListRef = useRef<iList<FileUseInfoMap> | null>(null);
  const { inc } = useCounter();

  function setSearch(search?) {
    visibleListRef.current = null;
    get_visible_list(search);
    _setSearch(search);
  }

  useEffect(() => {
    visibleListRef.current = null;
    get_visible_list();
    inc();
  }, [file_use_list]);

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
          placeholder="Search (use /re/ for regexp)..."
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
    return <MarkAll how={"seen"} onClick={() => click_mark_all_read()} />;
  }

  function open_selected(): void {
    if (visibleListRef.current == null) return;
    const x = visibleListRef.current.get(cursor);
    if (x == null) return;
    open_file_use_entry(
      x.get("project_id"),
      x.get("path"),
      x.get("show_chat", false),
      redux,
    );
  }

  function get_visible_list(_search?: string): iList<FileUseInfoMap> {
    if (visibleListRef.current == null) {
      visibleListRef.current = file_use_list;
      const theSearch = _search ?? search;
      if (theSearch) {
        const s = search_split(theSearch.toLowerCase());
        visibleListRef.current = visibleListRef.current.filter((info) =>
          search_match(info.get("search"), s),
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

  return (
    <div className={"smc-vfill smc-file-use-viewer"}>
      <VisibleMDLG>
        <Title level={4} style={{ margin: "15px", textAlign: "center" }}>
          Recently edited documents and chat
        </Title>
      </VisibleMDLG>
      <Row key="top" style={{ marginBottom: "5px" }}>
        <Col sm={9}>{render_search_box()}</Col>
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
