/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import { useIsMountedRef, useMemo, useState } from "smc-webapp/app-framework";
import { Editor, Element, Range, Transforms } from "slate";

function getLinkURL(editor): string | undefined {
  const { selection } = editor;
  if (selection == null || !Range.isCollapsed(selection)) {
    return;
  }
  for (const [node] of Editor.nodes(editor, {
    match: (node) => Element.isElement(node) && node.type == "link",
  })) {
    // @ts-ignore
    return node.url;
  }
}

export function setLinkURL(editor, url: string) {
  const { selection } = editor;
  if (selection == null || !Range.isCollapsed(selection)) {
    return;
  }
  for (const [, path] of Editor.nodes(editor, {
    match: (node) => Element.isElement(node) && node.type == "link",
  })) {
    Transforms.setNodes(editor, { url }, { at: path });
    return;
  }
}

export const useLinkURL = (editor) => {
  const isMountedRef = useIsMountedRef();

  const [linkURL, setLinkURL] = useState<string | undefined>(
    getLinkURL(editor)
  );

  const updateLinkURL = useMemo(() => {
    const f = () => {
      if (!isMountedRef.current) return;
      setLinkURL(getLinkURL(editor));
    };
    // We debounce to avoid any potential performance implications while
    // typing and for the reason mentioned in the NOTE above.  leading=false
    // is the default, but I just want to be very clear about that below.
    return debounce(f, 200, { leading: false });
  }, []);

  return { linkURL, updateLinkURL };
};
