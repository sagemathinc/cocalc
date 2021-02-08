/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useRedux } from "../../app-framework";
import { TableOfContents as TOC, TableOfContentsEntryList } from "../../r_misc";
import { Actions } from "./actions";

interface Props {
  font_size: number;
  actions: Actions;
}

export const TableOfContents: React.FC<Props> = React.memo(
  ({ font_size, actions }) => {
    const contents: TableOfContentsEntryList | undefined = useRedux([
      actions.name,
      "contents",
    ]);

    return (
      <TOC
        contents={contents}
        style={{ fontSize: `${font_size - 4}px` }}
        scrollTo={actions.scrollToHeading.bind(actions)}
      />
    );
  }
);
