import React from "react";
import { Element, Text } from "slate";
import String from "./string";
import { PLACEHOLDER_SYMBOL } from "../utils/weak-maps";
import { RenderLeafProps } from "./editable";
import { isEqual } from "lodash";

/**
 * Individual leaves in a text node with unique formatting.
 */

const Leaf = (props: {
  isLast: boolean;
  leaf: Text;
  parent: Element;
  renderLeaf?: React.FC<RenderLeafProps>;
  text: Text;
}) => {
  const {
    leaf,
    isLast,
    text,
    parent,
    renderLeaf = (props: RenderLeafProps) => <DefaultLeaf {...props} />,
  } = props;

  let children = (
    <String isLast={isLast} leaf={leaf} parent={parent} text={text} />
  );

  if (leaf[PLACEHOLDER_SYMBOL]) {
    children = (
      <React.Fragment>
        <span
          contentEditable={false}
          style={{
            pointerEvents: "none",
            display: "inline-block",
            width: "0",
            maxWidth: "100%",
            whiteSpace: "nowrap",
            opacity: "0.333",
            userSelect: "none",
            fontStyle: "normal",
            fontWeight: "normal",
            textDecoration: "none",
          }}
        >
          {leaf["placeholder"]}
        </span>
        {children}
      </React.Fragment>
    );
  }

  // COMPAT: Having the `data-` attributes on these leaf elements ensures that
  // in certain misbehaving browsers they aren't weirdly cloned/destroyed by
  // contenteditable behaviors. (2019/05/08)
  const attributes: {
    "data-slate-leaf": true;
  } = {
    "data-slate-leaf": true,
  };

  return React.createElement(renderLeaf, { attributes, children, leaf, text });
};

const MemoizedLeaf = React.memo(Leaf, (prev, next) => {
  return (
    next.parent === prev.parent &&
    next.isLast === prev.isLast &&
    next.renderLeaf === prev.renderLeaf &&
    next.text === prev.text &&
    isEqual(next.leaf, prev.leaf)
  );
});

export const DefaultLeaf = (props: RenderLeafProps) => {
  const { attributes, children } = props;
  return <span {...attributes}>{children}</span>;
};

export default MemoizedLeaf;
