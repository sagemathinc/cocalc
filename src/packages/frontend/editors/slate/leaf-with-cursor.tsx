import { Cursor } from "@cocalc/frontend/jupyter/cursors";
import Leaf from "./leaf";
import type { RenderLeafProps } from "./slate-react";

export default function LeafWithCursor({
  attributes,
  children,
  leaf,
  text,
}: RenderLeafProps) {
  if ((leaf as any).cursor == null) {
    return (
      <Leaf leaf={leaf} text={text} attributes={attributes}>
        {children}
      </Leaf>
    );
  }
  const { name, color, paddingText } = (leaf as any).cursor;
  return (
    <Leaf leaf={leaf} text={text} attributes={attributes}>
      <span>
        <span contentEditable={false}>
          <Cursor name={name} color={color} paddingText={paddingText} />
        </span>
        {children}
      </span>
    </Leaf>
  );
}
