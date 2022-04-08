import { Editor, Text, Path, Element, Node } from "slate";
import { ReactEditor, useSlateStatic } from "..";

/**
 * Leaf content strings.
 */

const String = (props: {
  isLast: boolean;
  leaf: Text;
  parent: Element;
  text: Text;
}) => {
  const { isLast, leaf, parent, text } = props;
  const editor = useSlateStatic();
  let path;
  try {
    path = ReactEditor.findPath(editor, text);
  } catch (err) {
    console.warn("WARNING: String -- unable to find path to node", text, err);
    return <ZeroWidthString />;
  }
  const parentPath = Path.parent(path);

  // COMPAT: Render text inside void nodes with a zero-width space.
  // So the node can contain selection but the text is not visible.
  if (editor.isVoid(parent)) {
    return <ZeroWidthString length={Node.string(parent).length} />;
  }

  // COMPAT: If this is the last text node in an empty block, render a zero-
  // width space that will convert into a line break when copying and pasting
  // to support expected plain text.
  if (
    leaf.text === "" &&
    parent.children[parent.children.length - 1] === text &&
    !editor.isInline(parent) &&
    Editor.string(editor, parentPath) === ""
  ) {
    return <ZeroWidthString isLineBreak />;
  }

  // COMPAT: If the text is empty, it's because it's on the edge of an inline
  // node, so we render a zero-width space so that the selection can be
  // inserted next to it still.
  if (leaf.text === "") {
    return <ZeroWidthString />;
  }

  // COMPAT: Browsers will collapse trailing new lines at the end of blocks,
  // so we need to add an extra trailing new lines to prevent that.
  if (isLast && leaf.text.slice(-1) === "\n") {
    return <TextString isTrailing text={leaf.text} />;
  }

  return <TextString text={leaf.text} />;
};

/**
 * Leaf strings with text in them.
 */

const TextString = (props: { text: string; isTrailing?: boolean }) => {
  const { text, isTrailing = false } = props;
  return (
    <span data-slate-string>
      {text}
      {isTrailing ? "\n" : null}
    </span>
  );
};

/**

Leaf strings without text, render as zero-width strings... or do they?  See below:

The style below is a hack to workaround a bug when using Chrome, which doesn't happen on Firefox or Safari.
The solution below is inspired by https://stackoverflow.com/questions/25897883/edit-cursor-not-displayed-on-chrome-in-contenteditable
Here's how to reproduce the bug in cocalc and the style below removed.

   1. Open a new blank doc with markdown source on the left and slate on the right.
   2. You can click either side and it focuses and shows a cursor.
   3. Click in the right slate side, then click the x to close the *left hand* markdown source.
   4. Broken -- no matter where you click, you can't get the slate editor to show a cursor (except on firefox and safari it works).

The workaround of rendering a ZeroWidthString as actually 1px in width and display inline block,
evidently gives the cursor somewhere to be in the case of an empty document. It seems harmless to
leave this 1px width even for nonempty documents.
 */

const ZeroWidthString = (props: { length?: number; isLineBreak?: boolean }) => {
  const { length = 0, isLineBreak = false } = props;
  return (
    <span
      data-slate-zero-width={isLineBreak ? "n" : "z"}
      data-slate-length={length}
      style={
        /* see note above! */
        {
          display: "inline-block",
          width: "1px",
        }
      }
    >
      {"\uFEFF"}
      {isLineBreak ? <br /> : null}
    </span>
  );
};

export default String;
