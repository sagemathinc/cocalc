/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Font-size widget — the braced declaration form `{\Large …}` only (see
font-size.ts). The body renders recursively via `renderInline`, so
nested bold / italic / math inside a sized group still render. The size
maps to an approximate `font-size` em multiple; an unrecognized name
falls back to 1em (no scaling).
*/

import { FONT_SIZE_EM } from "../font-size";
import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";
import { renderInline } from "./render-inline";

export function FontSize(props: WidgetProps) {
  const sizeName =
    (props.descriptor.payload?.sizeName as string | undefined) ?? "";
  const content =
    (props.descriptor.payload?.content as string | undefined) ?? "";
  const em = FONT_SIZE_EM[sizeName] ?? 1;
  return (
    <Widget {...props}>
      {content === "" ? (
        <EmptyPlaceholder label={`empty \\${sizeName}`} />
      ) : (
        <span style={{ fontSize: `${em}em` }}>{renderInline(content)}</span>
      )}
    </Widget>
  );
}
