/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useRef } from "react";
import { Editor, Element, Transforms } from "slate";
import { rangeAll } from "../slate-util";

export function setElement(
  editor: Editor,
  element: Element,
  obj: object
): Element | undefined {
  // Usually when setElement is called, the element we are searching for is right
  // near the selection, so this first search finds it.
  for (const [, path] of Editor.nodes(editor, {
    match: (node) => node === element,
  })) {
    Transforms.setNodes(editor, obj, { at: path });
    // We only want the first one (there are no others, but setNode doesn't have a short circuit option).
    // Also, we return the transformed node, so have to find it:
    return Editor.node(editor, path)[0] as Element;
  }

  // Searching at the selection failed, so we try searching the entire document instead.
  // This has to work.
  for (const [, path] of Editor.nodes(editor, {
    match: (node) => node === element,
    at: rangeAll(editor),
  })) {
    Transforms.setNodes(editor, obj, { at: path });
    return Editor.node(editor, path)[0] as Element;
  }

  // This situation should never ever happen anymore (see big comment below):
  console.warn(
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
    const newElement = setElement(editor, elementRef.current, obj);
    if (newElement !== undefined) {
      // Here's why we do this: if we call the function returned by useSetElement twice in the same
      // render loop, then the above "elementRef.current = element;" doesn't have a chance
      // to happen (it happens at most once per render loop), and the second call to setElement
      // then fails.  Data loss ensues.  A way to cause this is when editing code in codemirror,
      // then hitting return and getting an indented line (e.g. "def f():    #" then hit return);
      // CodeMirror triggers two onChange events with the same content, and the second one causes
      // the warning about "setElement unable to find element in document".  I'm sure onChange could
      // fire in other NOT harmless ways in CodeMirror as well triggering this, and that I've seen
      // it, with the result being that something you just typed is undone.
      // That's why we imediately set the elementRef here:
      elementRef.current = newElement;
    }
  };
}
