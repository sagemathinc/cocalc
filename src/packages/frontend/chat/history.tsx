/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List, Map } from "immutable";
import { trunc_middle } from "@cocalc/util/misc";
import { sanitize_html_safe } from "@cocalc/frontend/misc";
import { Well } from "@cocalc/frontend/antd-bootstrap";
import { TimeAgo } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

export function HistoryTitle() {
  return (
    <div
      style={{
        borderRadius: "10px 10px 0px 0px",
        textAlign: "center",
        padding: "0px",
      }}
    >
      <span style={{ fontStyle: "italic", fontWeight: "bold" }}>
        Message History
      </span>
    </div>
  );
}

export function HistoryFooter() {
  return (
    <div
      style={{ borderRadius: "0px 0px 10px 10px", marginBottom: "3px" }}
    ></div>
  );
}

interface HistoryProps {
  history?: List<any>;
  user_map?: Map<string, any>;
}

export function History({ history, user_map }: HistoryProps) {
  if (history == null || user_map == null) {
    return null;
  }
  // convert to javascript from immutable, and remove current version.
  const historyList = history.toJS().slice(1);
  const v: JSX.Element[] = [];
  for (const index in historyList) {
    const objects = historyList[index];
    const value = sanitize_html_safe(objects.content);
    const author = trunc_middle(
      user_map.getIn([objects.author_id, "first_name"]) +
        " " +
        user_map.getIn([objects.author_id, "last_name"]),
      20
    );
    v.push(
      <Well key={index} style={{ marginBottom: "0px" }}>
        <div style={{ marginBottom: "-10px", wordWrap: "break-word" }}>
          <StaticMarkdown value={value} />
        </div>
        <div className="small">
          {value.trim() == "" ? "Message deleted " : "Last edit "}
          <TimeAgo date={new Date(objects.date)} />
          {" by " + author}
        </div>
      </Well>
    );
  }
  return <div>{v}</div>;
}
