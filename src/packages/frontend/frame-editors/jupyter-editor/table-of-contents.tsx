/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { React, useRedux } from "@cocalc/frontend/app-framework";
import { JupyterEditorActions } from "./actions";
import {
  TableOfContents as TOC,
  TableOfContentsEntryList,
} from "@cocalc/frontend/components";
import $ from "jquery";

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
    async function jump_to_cell(
      id: string,
      extra = "top" as "top",
    ): Promise<void> {
      actions.jump_to_cell(id, extra);
      // stupid hack due to rendering/windowing delays...
      await delay(1);
      actions.jump_to_cell(id, extra);
      await delay(50);
      actions.jump_to_cell(id, extra);
    }

    return (
      <TOC
        contents={contents}
        fontSize={font_size}
        scrollTo={async ({ id, extra }) => {
          const { cell_id, markdown_id } = JSON.parse(id);
          jump_to_cell(cell_id, extra);
          if (markdown_id) {
            const n = parseInt(markdown_id);
            const f = () => {
              // just use some "dumb" jquery to scroll the actual heading into view.
              // It's pretty hard to do this otherwise, given our current design.
              const cell = $(`#${cell_id}`);
              const elt = $(cell.find(".cocalc-jupyter-header")[n]);
              if (elt.length == 0) {
                return;
              }
              // @ts-ignore -- it's a jquery plugin
              elt.scrollintoview();
            };
            f();
            await delay(2);
            f();
            await delay(200);
            f();
          }
        }}
      />
    );
  },
);
