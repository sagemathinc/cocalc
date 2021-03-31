/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
import { List, Map } from "immutable";
import { trunc_middle } from "smc-util/misc";
import { sanitize_html_safe } from "../misc-page";
import { Markdown, TimeAgo } from "../r_misc";
import { ListGroupItem, Well } from "react-bootstrap";

export const HistoryTitle: React.FC<{}> = () => {
  return (
    <ListGroupItem
      style={{
        borderRadius: "10px 10px 0px 0px",
        textAlign: "center",
        padding: "0px",
      }}
    >
      <span style={{ fontStyle: "italic", fontWeight: "bold" }}>
        Message History
      </span>
    </ListGroupItem>
  );
};

export const HistoryFooter: React.FC<{}> = () => {
  return (
    <ListGroupItem
      style={{ borderRadius: "0px 0px 10px 10px", marginBottom: "3px" }}
    ></ListGroupItem>
  );
};

export const History: React.FC<{
  history?: List<any>;
  user_map?: Map<string, any>;
}> = ({ history, user_map }) => {
  if (history == null || user_map == null) {
    return null;
  }
  const historyList = history.toJS().slice(1); // convert to javascript from immutable, and remove current version.
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
      <Well key={index} bsSize="small" style={{ marginBottom: "0px" }}>
        <div style={{ marginBottom: "-10px", wordWrap: "break-word" }}>
          <Markdown value={value} />
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
};
