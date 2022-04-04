import React from "react";
import { useRef } from "react";
import { Range, Element, Text as SlateText } from "slate";

import Leaf from "./leaf";
import { ReactEditor, useSlateStatic } from "..";
import { RenderLeafProps } from "./editable";
import { useIsomorphicLayoutEffect } from "../hooks/use-isomorphic-layout-effect";
import {
  KEY_TO_ELEMENT,
  NODE_TO_ELEMENT,
  ELEMENT_TO_NODE,
} from "../utils/weak-maps";
import { isEqual } from "lodash";

/**
 * Text.
 */

const Text = (props: {
  decorations: Range[];
  isLast: boolean;
  parent: Element;
  renderLeaf?: React.FC<RenderLeafProps>;
  text: SlateText;
}) => {
  const { decorations, isLast, parent, renderLeaf, text } = props;
  const editor = useSlateStatic();
  const ref = useRef<HTMLSpanElement>(null);
  const leaves = SlateText.decorations(text, decorations);
  const children: JSX.Element[] = [];
  const key = ReactEditor.findKey(editor, text);

  for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    // We need to use a key specifically for each leaf,
    // otherwise when doing incremental search it doesn't
    // properly update (which makes perfect sense).
    const leaf_key = ReactEditor.findKey(editor, leaf);

    children.push(
      <Leaf
        isLast={isLast && i === leaves.length - 1}
        key={leaf_key.id}
        leaf={leaf}
        text={text}
        parent={parent}
        renderLeaf={renderLeaf}
      />
    );
  }

  // Update element-related weak maps with the DOM element ref.
  useIsomorphicLayoutEffect(() => {
    if (ref.current) {
      KEY_TO_ELEMENT.set(key, ref.current);
      NODE_TO_ELEMENT.set(text, ref.current);
      ELEMENT_TO_NODE.set(ref.current, text);
    } else {
      KEY_TO_ELEMENT.delete(key);
      NODE_TO_ELEMENT.delete(text);
    }

    // It's also CRITICAL to update the selection after changing the text,
    // at least when using windowing.
    // See comment in selection-sync.ts about this.
    editor.updateDOMSelection?.();
  });

  return (
    <span data-slate-node="text" ref={ref}>
      {children}
    </span>
  );
};

/**
 * Check if a list of ranges is equal to another.
 *
 * PERF: this requires the two lists to also have the ranges inside them in the
 * same order, but this is an okay constraint for us since decorations are
 * kept in order, and the odd case where they aren't is okay to re-render for.
 */

const isRangeListEqual = (list: Range[], another: Range[]): boolean => {
  if (list.length !== another.length) {
    return false;
  }

  for (let i = 0; i < list.length; i++) {
    const range = list[i];
    const other = another[i];

    if (!isEqual(range, other)) {
      return false;
    }
  }

  return true;
};

const MemoizedText = React.memo(Text, (prev, next) => {
  // I think including parent is wrong here. E.g.,
  // parent is not included in the analogous function
  // in element.tsx. See my comment here:
  // https://github.com/ianstormtaylor/slate/issues/4056#issuecomment-768059323
  const is_equal =
    // next.parent === prev.parent &&
    next.renderLeaf === prev.renderLeaf &&
    next.isLast === prev.isLast &&
    next.text === prev.text &&
    isRangeListEqual(next.decorations, prev.decorations);
  /*
  console.log("Text is_equal", is_equal, [
    next.renderLeaf === prev.renderLeaf,
    next.isLast === prev.isLast,
    next.text === prev.text,
    isEqual(next.decorations, prev.decorations),
  ]);*/
  return is_equal;
});

export default MemoizedText;
