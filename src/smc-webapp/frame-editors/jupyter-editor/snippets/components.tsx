/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, CSS, useState } from "../../../app-framework";
import { Markdown } from "../../../r_misc";
import { Button } from "antd";
import { CopyOutlined } from "@ant-design/icons";

export const Highlight: React.FC<{
  text: string;
  search: string;
  style?: CSS;
}> = React.memo(({ text, search, style }) => {
  function highlight_md(descr, search) {
    if (search == null || search === "") return descr;
    const pos = descr.toLowerCase().indexOf(search.toLowerCase());
    if (pos == -1) return descr;
    const hit = descr.slice(pos, pos + search.length);
    const hl =
      descr.slice(0, pos) +
      `<span class='hl'>${hit}</span>` +
      descr.slice(pos + search.length);
    return hl;
  }

  return (
    <Markdown
      className={"cc-jupyter-snippet-header"}
      style={style}
      value={highlight_md(text, search)}
    />
  );
});

export const Copy: React.FC<{ code: string[] | undefined }> = React.memo(
  ({ code }) => {
    const [clicked, set_clicked] = useState(false);
    if (!code) return null;
    return (
      <Button
        onClick={() => {
          navigator.clipboard.writeText(code.join("\n"));
          set_clicked(true);
        }}
        type="link"
        icon={<CopyOutlined />}
      >
        {clicked ? "copied" : "copy"}
      </Button>
    );
  }
);
