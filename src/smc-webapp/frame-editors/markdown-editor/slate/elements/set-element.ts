/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useRef } from "../../../../app-framework";
import { Editor, Element, Transforms } from "slate";

export function setElement(
  editor: Editor,
  element: Element,
  obj: object
): void {
  for (const [, path] of Editor.nodes(editor, {
    match: (node) => node === element,
  })) {
    Transforms.setNodes(editor, obj, { at: path });
    break; // we only want the first one (there are no others, but setNode doesn't have a short circuit option)
  }
}

export function useSetElement(editor: Editor, element: Element): (obj) => void {
  // This is a trick to get around the fact that
  // the onChange callback below can't directly reference
  // the element, since it gets the version of element
  // from when that closure was created.
  const elementRef = useRef<Element>(element);
  elementRef.current = element;
  return (obj) => {
    setElement(editor, elementRef.current, obj);
  };
}
