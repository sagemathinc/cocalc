/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useRef } from "../../../../app-framework";
import { Editor, Element, Transforms } from "slate";
import { rangeAll } from "../keyboard/select-all";

export function setElement(
  editor: Editor,
  element: Element,
  obj: object
): void {
  // Usually when setElement is called, the element we are searching for is right
  // near the selection, so this first search finds it.
  for (const [, path] of Editor.nodes(editor, {
    match: (node) => node === element,
  })) {
    Transforms.setNodes(editor, obj, { at: path });
    return; // we only want the first one (there are no others, but setNode doesn't have a short circuit option)
  }

  // Searching at the selection failed, so we try searching the entire document instead.
  // This has to work.
  for (const [, path] of Editor.nodes(editor, {
    match: (node) => node === element,
    at: rangeAll(editor),
  })) {
    Transforms.setNodes(editor, obj, { at: path });
    return;
  }

  console.log(
    "WARNING: setElement unable to find element in document",
    element,
    obj
  );
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
