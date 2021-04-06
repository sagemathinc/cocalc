/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { SlateEditor } from "../editable-markdown";

import { MarksBar } from "./marks-bar";
import { Marks } from "./marks";
import { LinkEdit } from "./link-edit";
import { ListProperties } from "./list";
import { ListEdit } from "./list-edit";

interface Props {
  Search: JSX.Element;
  isCurrent?: boolean;
  marks: Marks;
  linkURL: string | undefined;
  listProperties: ListProperties | undefined;
  editor: SlateEditor;
}

const HEIGHT = "25px";

export const EditBar: React.FC<Props> = ({
  isCurrent,
  Search,
  marks,
  linkURL,
  listProperties,
  editor,
}) => {
  function renderContent() {
    return (
      <>
        <MarksBar marks={marks} editor={editor} />
        <LinkEdit linkURL={linkURL} editor={editor} />
        <ListEdit listProperties={listProperties} editor={editor} />
        <div style={{ flex: 1, maxWidth: "50ex", marginRight: "15px" }}>
          {Search}
        </div>
      </>
    );
  }

  return (
    <div
      style={{
        borderBottom: isCurrent ? "1px solid lightgray" : "1px solid white",
        height: HEIGHT,
        display: "flex",
        flexDirection: "row",
      }}
    >
      {isCurrent && renderContent()}
    </div>
  );
};
