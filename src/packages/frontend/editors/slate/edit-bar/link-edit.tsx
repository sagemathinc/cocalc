/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { useState } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/r_misc";
import { Editor } from "slate";
import { open_new_tab } from "@cocalc/frontend/misc-page";
import { Input } from "antd";
import { setLinkURL } from "./link-url";

interface Props {
  linkURL: string | undefined;
  editor: Editor;
}

export const LinkEdit: React.FC<Props> = ({ linkURL, editor }) => {
  const [edit, setEdit] = useState<boolean>(false);
  const [saveValue, setSaveValue] = useState<string>("");
  let body;

  const icon = (
    <a onClick={() => (linkURL ? open_new_tab(linkURL) : undefined)}>
      <Icon name="link" />
    </a>
  );
  if (linkURL == null) {
    return <></>;
  }
  if (edit) {
    body = (
      <Input
        autoFocus
        style={{ width: "100%", maxWidth: "50ex" }}
        addonBefore={icon}
        addonAfter={
          saveValue == linkURL ? (
            <Icon name={"check"} style={{ width: "2em", color: "#5cb85c" }} />
          ) : (
            <span style={{ width: "2em" }}>...</span>
          )
        }
        size="small"
        placeholder="Link target..."
        defaultValue={linkURL}
        onChange={(e) => {
          setLinkURL(editor, e.target.value);
          setSaveValue(e.target.value);
        }}
        onBlur={() => setEdit(false)}
      />
    );
  } else {
    body = (
      <div
        onClick={() => setEdit(true)}
        style={{
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          padding: "0 10px",
          borderLeft: "1px solid lightgray",
          borderRight: "1px solid lightgray",
          maxWidth: "50ex",
          color: !linkURL ? "#999" : undefined,
        }}
      >
        {icon} {linkURL ? linkURL : "Link target..."}
      </div>
    );
  }

  return <div style={{ flex: 1 }}>{body}</div>;
};
