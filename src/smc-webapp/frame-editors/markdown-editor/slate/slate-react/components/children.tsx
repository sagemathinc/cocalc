import * as React from "react";
import { Editor, Range, Element, NodeEntry, Ancestor, Descendant } from "slate";

import ElementComponent from "./element";
import TextComponent from "./text";
import { ReactEditor } from "..";
import { useSlateStatic } from "../hooks/use-slate-static";
import { NODE_TO_INDEX, NODE_TO_PARENT } from "../utils/weak-maps";
import { RenderElementProps, RenderLeafProps } from "./editable";
import { WindowedList } from "smc-webapp/r_misc";

/**
 * Children.
 */

const Children = (props: {
  decorate: (entry: NodeEntry) => Range[];
  decorations: Range[];
  node: Ancestor;
  renderElement?: React.FC<RenderElementProps>;
  renderLeaf?: React.FC<RenderLeafProps>;
  selection: Range | null;
}) => {
  const {
    decorate,
    decorations,
    node,
    renderElement,
    renderLeaf,
    selection,
  } = props;
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
  const isLeafBlock =
    Element.isElement(node) &&
    !editor.isInline(node) &&
    Editor.hasInlines(editor, node);

  const renderChild = ({ index }) => {
    // if (path.length == 0) console.log("renderChild", index);
    const n = node.children[index] as Descendant;
    const p = path.concat(index);
    const key = ReactEditor.findKey(editor, n);
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

  if (path.length == 0) {
    // top level -- using windowing!
    return (
      <WindowedList
        row_count={node.children.length}
        row_renderer={renderChild}
        overscan_row_count={20}
        estimated_row_size={32}
        row_key={(index) => `${index}`}
        row_style={(editor as any).rowStyle}
      />
    );
  } else {
    //const t0 = new Date().valueOf();
    // anything else -- just render the children
    const children: JSX.Element[] = [];
    for (let index = 0; index < node.children.length; index++) {
      children.push(renderChild({ index }));
    }
    /* console.log(
      "update children for ",
      node.children.length,
      " nodes in ",
      new Date().valueOf() - t0,
      "ms"
    );*/

    return <>{children}</>;
  }
};

export default Children;
