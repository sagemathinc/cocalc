import * as React from "react";
import { Editor, Range, Element, NodeEntry, Ancestor, Descendant } from "slate";

import ElementComponent from "./element";
import TextComponent from "./text";
import { ReactEditor } from "..";
import { useSlateStatic } from "../hooks/use-slate-static";
import { NODE_TO_INDEX, NODE_TO_PARENT } from "../utils/weak-maps";
import { RenderElementProps, RenderLeafProps } from "./editable";
import { WindowedList } from "smc-webapp/r_misc";

function timer(...args): () => void {
  const t0 = new Date().valueOf();
  const label = args.join(" ");
  console.log(`start: ${label}...`);
  return () => {
    console.log(`done : ${label} -- ${new Date().valueOf() - t0}ms`);
  };
}

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
  const path = ReactEditor.findPath(editor, node);
  const isLeafBlock =
    Element.isElement(node) &&
    !editor.isInline(node) &&
    Editor.hasInlines(editor, node);

  const renderChild = ({ index }) => {
    //console.log("renderChild", { index });
    const n = node.children[index] as Descendant;
    const p = path.concat(index);
    const key = ReactEditor.findKey(editor, n);
    const range = Editor.range(editor, p);
    const sel = selection && Range.intersection(range, selection);
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
          selection={sel}
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

  for (let i = 0; i < node.children.length; i++) {
    const n = node.children[i];
    NODE_TO_INDEX.set(n, i);
    NODE_TO_PARENT.set(n, node);
  }

  /*
  let t = timer("rendering all children", node.children.length);
  const children: JSX.Element[] = [];
  for (let i = 0; i < node.children.length; i++) {
    children.push(renderChild(i));
  }
  t();
  */
  if (path.length == 0) {
    // top level -- using windowing!
    return (
      <WindowedList
        row_count={node.children.length}
        row_renderer={renderChild}
        overscan_row_count={5}
        estimated_row_size={22}
        row_key={(index) => `${index}`}
      />
    );
  } else {
    // proceed as usual for now
    const children: JSX.Element[] = [];
    for (let index = 0; index < node.children.length; index++) {
      children.push(renderChild({ index }));
    }
    return <>{children}</>;
  }
};

export default Children;
