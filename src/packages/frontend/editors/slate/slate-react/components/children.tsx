import React, { useCallback, useRef } from "react";
import { Editor, Range, Element, Ancestor, Descendant } from "slate";

import ElementComponent from "./element";
import TextComponent from "./text";
import { ReactEditor } from "..";
import { useSlateStatic } from "../hooks/use-slate-static";
import { useDecorate } from "../hooks/use-decorate";
import { NODE_TO_INDEX, NODE_TO_PARENT } from "../utils/weak-maps";
import { RenderElementProps, RenderLeafProps } from "./editable";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { shallowCompare } from "@cocalc/util/misc";
import { SlateEditor } from "../../editable-markdown";

export interface WindowingParams {
  rowStyle?: React.CSSProperties;
  overscanRowCount?: number;
  estimatedRowSize?: number;
  marginTop?;
  marginBottom?;
  rowSizeEstimator?: (Node) => number | undefined;
}

/**
 * Children.
 */

interface Props {
  decorations: Range[];
  node: Ancestor;
  renderElement?: React.FC<RenderElementProps>;
  renderLeaf?: React.FC<RenderLeafProps>;
  selection: Range | null;
  windowing?: WindowingParams;
  onScroll?: () => void; // called after scrolling when windowing is true.
  isComposing?: boolean;
  hiddenChildren?: Set<number>;
}

const Children: React.FC<Props> = React.memo(
  ({
    decorations,
    node,
    renderElement,
    renderLeaf,
    selection,
    windowing,
    onScroll,
    hiddenChildren,
  }) => {
    const decorate = useDecorate();
    const editor = useSlateStatic() as SlateEditor;
    let path;
    try {
      path = ReactEditor.findPath(editor, node);
    } catch (err) {
      console.warn("WARNING: unable to find path to node", node, err);
      return <></>;
    }
    //console.log("render Children", path);

    const isLeafBlock =
      Element.isElement(node) &&
      !editor.isInline(node) &&
      Editor.hasInlines(editor, node);

    const renderChild = ({ index }: { index: number }) => {
      //console.log("renderChild", index, JSON.stringify(selection));
      // When windowing, we put a margin at the top of the first cell
      // and the bottom of the last cell.  This makes sure the scroll
      // bar looks right, which it would not if we put a margin around
      // the entire list.
      let marginTop: string | undefined = undefined;
      let marginBottom: string | undefined = undefined;
      if (windowing != null) {
        if (windowing.marginTop && index === 0) {
          marginTop = windowing.marginTop;
        } else if (
          windowing.marginBottom &&
          index + 1 === node?.children?.length
        ) {
          marginBottom = windowing.marginBottom;
        }
      }

      if (hiddenChildren?.has(index)) {
        // TRICK: We use a small positive height since a height of 0 gets ignored, as it often
        // appears when scrolling and allowing that breaks everything (for now!).
        return (
          <div
            style={{ height: "1px", marginTop, marginBottom }}
            contentEditable={false}
          />
        );
      }
      const n = node.children[index] as Descendant;
      const key = ReactEditor.findKey(editor, n);
      let ds, range;
      if (path != null) {
        const p = path.concat(index);
        range = Editor.range(editor, p);
        ds = decorate([n, p]);
        for (const dec of decorations) {
          const d = Range.intersection(dec, range);

          if (d) {
            ds.push(d);
          }
        }
      } else {
        ds = [];
        range = null;
      }

      if (Element.isElement(n)) {
        const x = (
          <ElementComponent
            decorations={ds}
            element={n}
            key={key.id}
            renderElement={renderElement}
            renderLeaf={renderLeaf}
            selection={
              selection && range && Range.intersection(range, selection)
            }
          />
        );
        if (marginTop || marginBottom) {
          return <div style={{ marginTop, marginBottom }}>{x}</div>;
        } else {
          return x;
        }
      } else {
        return (
          <TextComponent
            decorations={ds ?? []}
            key={key.id}
            isLast={isLeafBlock && index === node.children.length - 1}
            parent={node as Element}
            renderLeaf={renderLeaf}
            text={n}
          />
        );
      }
    };

    for (let i = 0; i < node.children.length; i++) {
      const n = node.children[i];
      NODE_TO_INDEX.set(n, i);
      NODE_TO_PARENT.set(n, node);
    }

    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    // see https://github.com/petyosi/react-virtuoso/issues/274
    const handleScrollerRef = useCallback((ref) => {
      scrollerRef.current = ref;
    }, []);
    if (windowing != null) {
      // using windowing

      // This is slightly awkward since when splitting frames, the component
      // gets unmounted and then mounted again, in which case editor.windowedListRef.current
      // does not get set to null, so we need to write the new virtuosoRef;
      if (editor.windowedListRef.current == null) {
        editor.windowedListRef.current = {};
      }
      editor.windowedListRef.current.virtuosoRef = virtuosoRef;
      editor.windowedListRef.current.getScrollerRef = () => scrollerRef.current; // we do this so windowListRef is JSON-able!

      // NOTE: the code for preserving scroll position when editing assumes
      // the visibleRange really is *visible*.  Thus if you mess with overscan
      // or related properties below, that will likely break.
      return (
        <Virtuoso
          ref={virtuosoRef}
          scrollerRef={handleScrollerRef}
          onScroll={onScroll}
          className="smc-vfill"
          totalCount={node.children.length}
          itemContent={(index) => (
            <div style={windowing.rowStyle}>{renderChild({ index })}</div>
          )}
          computeItemKey={(index) =>
            ReactEditor.findKey(editor, node.children[index])?.id ?? `${index}`
          }
          rangeChanged={(visibleRange) => {
            editor.windowedListRef.current.visibleRange = visibleRange;
          }}
          itemsRendered={(items) => {
            const scrollTop = scrollerRef.current?.scrollTop ?? 0;
            // need both items, since may use first if there is no second...
            editor.windowedListRef.current.firstItemOffset =
              scrollTop - items[0]?.offset;
            editor.windowedListRef.current.secondItemOffset =
              scrollTop - items[1]?.offset;
          }}
        />
      );
    } else {
      // anything else -- just render the children
      const children: JSX.Element[] = [];
      for (let index = 0; index < node.children.length; index++) {
        try {
          children.push(renderChild({ index }));
        } catch (err) {
          console.warn(
            "SLATE -- issue in renderChild",
            node.children[index],
            err
          );
        }
      }

      return <>{children}</>;
    }
  },
  (prev, next) => {
    if (next.isComposing) {
      // IMPORTANT: We prevent render while composing, since rendering
      // would corrupt the DOM which confuses composition input, thus
      // breaking input on Android, and many non-US languages. See
      // https://github.com/ianstormtaylor/slate/issues/4127#issuecomment-803215432
      return true;
    }
    return shallowCompare(prev, next);
  }
);

export default Children;

/*
function getCursorY(): number | null {
  const sel = getSelection();
  if (sel == null || sel.rangeCount == 0) {
    return null;
  }
  return sel.getRangeAt(0)?.getBoundingClientRect().y;
}

function preserveCursorScrollPosition() {
  const before = getCursorY();
  if (before === null) return;
  requestAnimationFrame(() => {
    const after = getCursorY();
    if (after === null) return;
    const elt = $('[data-virtuoso-scroller="true"]');
    if (elt) {
      elt.scrollTop((elt.scrollTop() ?? 0) + (after - before));
    }
  });
}
*/
