/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Well } from "@cocalc/frontend/antd-bootstrap";
import { TimeAgo } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { sanitize_html_safe } from "@cocalc/frontend/misc";
import {
  isLanguageModelService,
  service2model,
} from "@cocalc/util/db-schema/llm-utils";
import { isValidUUID, trunc_middle } from "@cocalc/util/misc";
import { LLMModelName } from "../components/llm-name";
import { historyArray } from "./access";

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
  history?: any;
  user_map?: any;
}

export function History({ history, user_map }: HistoryProps) {
  if (history == null || user_map == null) {
    return null;
  }

  function renderAuthor(author_id: string): React.JSX.Element | null {
    if (user_map == null) {
      return null;
    }
    if (isValidUUID(author_id) && user_map.get(author_id) != null) {
      const first_name = user_map.getIn([author_id, "first_name"]);
      const last_name = user_map.getIn([author_id, "last_name"]);
      return <>{trunc_middle(`${first_name} ${last_name}`, 20)}</>;
    } else if (isLanguageModelService(author_id)) {
      return <LLMModelName model={service2model(author_id)} size={14} />;
    } else {
      return <>Unknown author</>;
    }
  }

  // convert to javascript from immutable, and remove current version.
  const historyList = historyArray({ history }).slice(1);
  const v: React.JSX.Element[] = [];
  for (const index in historyList) {
    const message = historyList[index];
    const { content, author_id, date } = message;
    const value = sanitize_html_safe(content);
    const author = renderAuthor(author_id);
    v.push(
      <Well key={index} style={{ marginBottom: "0px" }}>
        <div style={{ marginBottom: "-10px", wordWrap: "break-word" }}>
          <StaticMarkdown value={value} />
        </div>
        <div className="small">
          {value.trim() == "" ? "Message deleted " : "Last edit "}
          <TimeAgo date={new Date(date)} />
          {author ? <> by {author}</> : undefined}
        </div>
      </Well>,
    );
  }
  return <div>{v}</div>;
}
