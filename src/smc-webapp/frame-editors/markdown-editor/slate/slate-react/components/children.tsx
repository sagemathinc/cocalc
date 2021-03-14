import * as React from "react";
import { Editor, Range, Element, NodeEntry, Ancestor, Descendant } from "slate";

import ElementComponent from "./element";
import TextComponent from "./text";
import { ReactEditor } from "..";
import { useSlateStatic } from "../hooks/use-slate-static";
import { NODE_TO_INDEX, NODE_TO_PARENT } from "../utils/weak-maps";
import { RenderElementProps, RenderLeafProps } from "./editable";
import { WindowedList } from "smc-webapp/r_misc";

export interface WindowingParams {
  rowStyle?: React.CSSProperties;
  overscanRowCount?: number;
  estimatedRowSize?: number;
}

/**
 * Children.
 */

interface Props {
  decorate: (entry: NodeEntry) => Range[];
  decorations: Range[];
  node: Ancestor;
  renderElement?: React.FC<RenderElementProps>;
  renderLeaf?: React.FC<RenderLeafProps>;
  selection: Range | null;
  windowing?: WindowingParams;
  isPreview?: boolean;
}

const Children: React.FC<Props> = ({
  decorate,
  decorations,
  node,
  renderElement,
  renderLeaf,
  selection,
  windowing,
  isPreview,
}) => {
  const editor = useSlateStatic();
  let path;
  try {
    path = ReactEditor.findPath(editor, node);
  } catch (err) {
    console.log(
      "TODO: unable to find path to node! So not rendering...",
      node,
      err
    );
    return <></>;
  }
  const cursor = selection?.focus?.path?.[0] ?? 0;
  const isLeafBlock =
    Element.isElement(node) &&
    !editor.isInline(node) &&
    Editor.hasInlines(editor, node);

  const renderChild = ({
    index,
    isPreview,
  }: {
    index: number;
    isPreview?: boolean;
  }) => {
    const n = node.children[index] as Descendant;
    const key = ReactEditor.findKey(editor, n);
    if (isPreview) {
      if (Element.isElement(n)) {
        return (
          <ElementComponent
            selection={null}
            decorations={[]}
            decorate={() => []}
            element={n}
            key={key.id}
            renderElement={({ attributes, children }) => {
              return (
                <div {...attributes} style={{ color: "#ccc" }}>
                  {children}
                </div>
              );
            }}
            renderLeaf={({ attributes, children }) => {
              return <span {...attributes}>{children}</span>;
            }}
            isPreview={true}
          />
        );
      } else {
        return (
          <TextComponent
            decorations={[]}
            key={key.id}
            isLast={isLeafBlock && index === node.children.length - 1}
            parent={node as Element}
            renderLeaf={({ attributes, children }) => {
              return <span {...attributes}>{children}</span>;
            }}
            text={n}
            isPreview={true}
          />
        );
      }
    }
    const p = path.concat(index);
    const range = Editor.range(editor, p);
    const ds = decorate([n, p]);

    for (const dec of decorations) {
      const d = Range.intersection(dec, range);

      if (d) {
        ds.push(d);
      }
    }

    if (Element.isElement(n)) {
      return (
        <ElementComponent
          decorate={decorate}
          decorations={ds}
          element={n}
          key={key.id}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          selection={selection && Range.intersection(range, selection)}
          isPreview={false}
        />
      );
    } else {
      return (
        <TextComponent
          decorations={ds}
          key={key.id}
          isLast={isLeafBlock && index === node.children.length - 1}
          parent={node as Element}
          renderLeaf={renderLeaf}
          text={n}
          isPreview={false}
        />
      );
    }
  };

  //const t0 = new Date().valueOf();
  for (let i = 0; i < node.children.length; i++) {
    const n = node.children[i];
    NODE_TO_INDEX.set(n, i);
    NODE_TO_PARENT.set(n, node);
  }
  /*  console.log(
    "update weakmap for ",
    node.children.length,
    " nodes in ",
    new Date().valueOf() - t0,
    "ms"
  );*/

  if (path.length == 0 && windowing != null) {
    // top level and using windowing!
    return (
      <WindowedList
        row_count={node.children.length}
        row_renderer={renderChild}
        overscan_row_count={windowing.overscanRowCount ?? 10}
        estimated_row_size={windowing.estimatedRowSize ?? 32}
        row_key={(index) => `${index}`}
        row_style={windowing.rowStyle}
      />
    );
  } else {
    // const t0 = new Date().valueOf();
    // anything else -- just render the children
    const children: JSX.Element[] = [];
    for (let index = 0; index < node.children.length; index++) {
      children.push(
        renderChild({
          index,
          isPreview:
            isPreview || (path.length == 0 && Math.abs(cursor - index) > 2),
        })
      );
    }
    /*
    console.log(
      "update children for ",
      node.children.length,
      " nodes in ",
      new Date().valueOf() - t0,
      "ms"
    );
    */

    return <>{children}</>;
  }
};

const MemoizedChildren = React.memo(Children, (prev, next) => {
  if (next.isPreview != prev.isPreview) return false;
  if (next.isPreview) return true;
  return false;
});

export default MemoizedChildren;
