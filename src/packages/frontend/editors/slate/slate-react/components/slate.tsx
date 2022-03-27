import React from "react";
import { useMemo, useState, useCallback, useEffect } from "react";
import { Descendant } from "slate";

import { ReactEditor } from "../plugin/react-editor";
import { FocusedContext } from "../hooks/use-focused";
import { EditorContext } from "../hooks/use-slate-static";
import { SlateContext } from "../hooks/use-slate";
import { EDITOR_TO_ON_CHANGE } from "../utils/weak-maps";

/**
 * A wrapper around the provider to handle `onChange` events, because the editor
 * is a mutable singleton so it won't ever register as "changed" otherwise.
 */

export const Slate = (props: {
  editor: ReactEditor;
  value: Descendant[];
  children: React.ReactNode;
  onChange: (value: Descendant[]) => void;
}) => {
  const { editor, children, onChange, value, ...rest } = props;
  const [ticks, setTick] = useState(0);

  // For the editor context we just create it *once* the first
  // time, then updated it every time by changing the reference.
  // This avoids an ENORMOUS amount of wasted effort otherwise,
  // which I found by profiling a large document, and is fine for
  // our purposes.
  const context: [ReactEditor] = useMemo(() => {
    editor.children = value;
    editor.ticks = ticks;
    Object.assign(editor, rest);
    return [editor];
  }, []); //[ticks, value, ...Object.values(rest)]);
  context[0].children = value;
  context[0].ticks = ticks;
  Object.assign(context[0], rest);

  // Similarly we use a singleton object for the focused context.
  // It turns out not doing this with these contexts makes slate
  // **insanely slow** on large documents.  Doing this... and it
  // is VERY fast.  It probably took over a month of my life to
  // understand this, so please don't mess it up again!
  const focused: { isFocused: boolean } = useMemo(() => {
    return { isFocused: ReactEditor.isFocused(editor) };
  }, []);
  focused.isFocused = ReactEditor.isFocused(editor);

  const onContextChange = useCallback(() => {
    onChange(editor.children);
    setTick(ticks + 1);
  }, [ticks, onChange]);

  EDITOR_TO_ON_CHANGE.set(editor, onContextChange);

  useEffect(() => {
    return () => {
      EDITOR_TO_ON_CHANGE.set(editor, () => {});
    };
  }, []);

  return (
    <SlateContext.Provider value={context}>
      <EditorContext.Provider value={editor}>
        <FocusedContext.Provider value={focused}>
          {children}
        </FocusedContext.Provider>
      </EditorContext.Provider>
    </SlateContext.Provider>
  );
};
