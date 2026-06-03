/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Link widgets:
  \href{url}{text} — rendered text is the second arg
  \url{url}        — rendered text is the URL itself

We DO NOT make the rendered text a real `<a href>`. Clicking the
widget activates marker dissolution (puts the user in source-edit
mode) rather than navigating away. To open the URL, the user can
copy it from the hover source-peek or dissolve the widget and
ctrl-click the URL via the editor's existing link recognition.

This avoids two failure modes: (a) accidentally navigating away from
the editor when the user meant to edit the link, and (b) needing to
intercept browser-level mouse-button behavior on the widget DOM.
*/

import { COLORS } from "@cocalc/util/theme";

import { WidgetProps } from "../types";
import { EmptyPlaceholder, Widget } from "./common";

const LINK_STYLE = {
  color: COLORS.BS_BLUE_TEXT,
  textDecoration: "underline",
} as const;

export function Href(props: WidgetProps) {
  const url = (props.descriptor.payload?.arg1 as string | undefined) ?? "";
  const text = (props.descriptor.payload?.arg2 as string | undefined) ?? "";
  return (
    <Widget {...props}>
      {text === "" ? (
        <EmptyPlaceholder label={`empty link → ${url || "?"}`} />
      ) : (
        <span style={LINK_STYLE}>{text}</span>
      )}
    </Widget>
  );
}

export function Url(props: WidgetProps) {
  const url = (props.descriptor.payload?.content as string | undefined) ?? "";
  return (
    <Widget {...props}>
      {url === "" ? (
        <EmptyPlaceholder label="empty url" />
      ) : (
        <span style={LINK_STYLE}>{url}</span>
      )}
    </Widget>
  );
}
