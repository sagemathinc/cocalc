/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { debounce } from "lodash";
import { useMemo, useState } from "@cocalc/frontend/app-framework";
import { Editor, Element, Range, Transforms } from "slate";

export interface ListProperties {
  tight: boolean;
  start: number | undefined; // undefined = bulleted list; defined = first number of list
}

function getListProperties(editor): ListProperties | undefined {
  const { selection } = editor;
  if (selection == null || !Range.isCollapsed(selection)) {
    return;
  }
  try {
    for (const [node] of Editor.nodes(editor, {
      mode: "lowest",
      match: (node) =>
        Element.isElement(node) &&
        (node.type == "bullet_list" || node.type == "ordered_list"),
    })) {
      if (!Element.isElement(node)) return; // type guard.
      // @ts-ignore -- TODO -- redo tightness to be prop of the list itself.
      const tight = !!node.tight;
      if (node.type == "bullet_list") {
        return { tight, start: undefined };
      } else {
        return { tight, start: node["start"] ?? 1 };
      }
    }
  } catch (_err) {
    return;
  }
}

export function setListProperties(editor, props: ListProperties) {
  const { selection } = editor;
  if (selection == null || !Range.isCollapsed(selection)) {
    return;
  }
  for (const [, path] of Editor.nodes(editor, {
    mode: "lowest",
    match: (node) =>
      Element.isElement(node) &&
      (node.type == "bullet_list" || node.type == "ordered_list"),
  })) {
    Transforms.setNodes(
      editor,
      {
        type: props.start == null ? "bullet_list" : "ordered_list",
        start: props.start,
        tight: props.tight,
      },
      { at: path }
    );
    return;
  }
}

export const useListProperties = (editor) => {
  const [listProperties, setListPropertiesState] = useState<
    ListProperties | undefined
  >(getListProperties(editor));

  const updateListProperties = useMemo(() => {
    const f = () => {
      setListPropertiesState(getListProperties(editor));
    };
    // We debounce to avoid any potential performance implications while
    // typing and for the reason mentioned in the NOTE above.
    return debounce(f, 200, { leading: true });
  }, []);

  return { listProperties, updateListProperties };
};
