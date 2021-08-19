/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useEffect, useRedux } from "../../app-framework";
import { TableOfContents as TOC, TableOfContentsEntryList } from "../../r_misc";
import { Actions } from "./actions";

interface Props {
  font_size: number;
  actions: Actions;
}

export const TableOfContents: React.FC<Props> = React.memo(
  ({ font_size, actions }) => {
    useEffect(() => {
      // I'm not completely certain why, but we have to do this update
      // in the NEXT render loop so that the contents useRedux thing below
      // immediately fires again causing a re-render.  If we don't do this,
      // the first change doesn't get caught and it seems like the contents
      // takes a while to load.
      setTimeout(() => actions.updateTableOfContents(true));
    }, []);
    const contents: TableOfContentsEntryList | undefined = useRedux([
      actions.name,
      "contents",
    ]);

    return (
      <TOC
        contents={contents}
        style={{ fontSize: `${font_size - 6}px` }}
        scrollTo={actions.scrollToHeading.bind(actions)}
      />
    );
  }
);
