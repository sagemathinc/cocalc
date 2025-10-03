/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { React, useEffect, useRedux } from "@cocalc/frontend/app-framework";
import {
  TableOfContents as TOC,
  TableOfContentsEntryList,
} from "@cocalc/frontend/components";
import { Actions } from "./actions";

interface Props {
  font_size: number;
  actions: Actions;
}

export const TableOfContents: React.FC<Props> = React.memo(
  ({ font_size, actions }) => {
    useEffect(() => {
      // We have to do this update
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
        fontSize={font_size}
        scrollTo={actions.scrollToHeading.bind(actions)}
      />
    );
  },
);
