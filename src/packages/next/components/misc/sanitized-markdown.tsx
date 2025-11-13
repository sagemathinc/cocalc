/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSSProperties } from "react";

import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { FileContext, IFileContext } from "@cocalc/frontend/lib/file-context";
import A from "components/misc/A";

export default function SanitizedMarkdown({
  style,
  value,
  anchorStyle,
}: {
  style?: CSSProperties;
  anchorStyle?: CSSProperties;
  value: string;
}) {
  const ctx: IFileContext = {
    AnchorTagComponent: A,
    noSanitize: false,
    anchorStyle,
  };
  return (
    <FileContext.Provider value={ctx}>
      <Markdown value={value} style={style} />
    </FileContext.Provider>
  );
}
