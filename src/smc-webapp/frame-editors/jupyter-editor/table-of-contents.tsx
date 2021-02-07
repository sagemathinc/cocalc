/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { React, useRedux } from "../../app-framework";
import { JupyterEditorActions } from "./actions";
import { TableOfContents as TOC, TableOfContentsEntryList } from "../../r_misc";

interface Props {
  font_size: number;
  actions: JupyterEditorActions;
}

export const TableOfContents: React.FC<Props> = React.memo(
  ({ font_size, actions }) => {
    const contents: TableOfContentsEntryList | undefined = useRedux([
      actions.jupyter_actions.name,
      "contents",
    ]);

    async function jump_to_cell(id: string, align): Promise<void> {
      actions.jump_to_cell(id, align);
      // stupid hack due to rendering/windowing delays...
      await delay(100);
      actions.jump_to_cell(id, align);
    }

    return (
      <TOC
        contents={contents}
        style={{ fontSize: `${font_size - 4}px` }}
        scrollTo={(id: string, align?: string) => jump_to_cell(id, align)}
      />
    );
  }
);
