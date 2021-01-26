import * as React from "react";
import { Editor, Range, Element, NodeEntry, Ancestor, Descendant } from "slate";

import ElementComponent from "./element";
import TextComponent from "./text";
import { ReactEditor } from "..";
import { useSlateStatic } from "../hooks/use-slate-static";
import { NODE_TO_INDEX, NODE_TO_PARENT } from "../utils/weak-maps";
import { RenderElementProps, RenderLeafProps } from "./editable";

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

  const renderChild = (i) => {
    const p = path.concat(i);
    const n = node.children[i] as Descendant;
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
          isLast={isLeafBlock && i === node.children.length - 1}
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

  let t = timer("rendering all children", node.children.length);
  const children: JSX.Element[] = [];
  for (let i = 0; i < node.children.length; i++) {
    children.push(renderChild(i));
  }
  t();

  return <React.Fragment>{children}</React.Fragment>;
};

export default Children;
