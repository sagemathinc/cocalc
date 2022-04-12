/*
Mostly static markdown, but with some minimal dynamic editable content, e.g., checkboxes,
and maybe some other nice features, but much less than a full slate editor!

This is a react component that renders markdown text using  Unlike the
component defined in editable-markdown.tsx, this component is *static* -- you
can't edit it. Moreover, it can be fully rendered on node.js for use in Next.js,
i.e., it doesn't depend on running in a browser.

What does this have to do with editors/slate?  There's a lot of excellent code
in here for:

- Parsing markdown that is enhanced with math, checkboxes, and any other
enhancements we use in CoCalc to a JSON format.

- Converting that parsed markdown to React components.

What Slate does is provide an interactive framework to manipulate that parsed
JSON object on which we build a WYSIWYG editor. However, the inputs above also
lead to a powerful and extensible way of rendering markdown text using React,
where we can use React components for rendering, rather than HTML. This is more
robust, secure, etc. Also, it's **possible** to use virtuoso to do windowing
and hence render very large documents, which isn't possible using straight HTML,
and we can do other things like section folding and table of contents in a natural
way with good code use!

- We also optionally support very very minimal editing of static markdown right now:
   - namely, you can click checkboxes.  That's it.
  Editing preserves as much as it can about your original source markdown.

*/

import { CSSProperties, useEffect, useRef, useMemo, useState } from "react";
import "./elements/init-ssr";
import { getStaticRender } from "./elements/register";
import { markdown_to_slate as markdownToSlate } from "./markdown-to-slate";
import { slate_to_markdown as slateToMarkdown } from "./slate-to-markdown";
import Leaf from "./leaf";

interface Props {
  value: string;
  style?: CSSProperties;
  onChange?: (string) => void; // if given support some very minimal amount of editing, e.g., checkboxes; onChange is called with modified markdown.
}

export default function MostlyStaticMarkdown({
  value,
  style,
  onChange,
}: Props) {
  // Convert markdown to our slate JSON object representation.
  const syncCacheRef = useRef<any>({});
  const valueRef = useRef<string>(value);
  const [slate, setSlate] = useState(
    markdownToSlate(value, false, syncCacheRef.current)
  );
  const handleChange = useMemo(() => {
    if (onChange == null) return; // nothing
    return (element, change) => {
      // Make a new slate value via setSlate, and also
      // report new markdown string via onChange.
      const slate1 = [...slate];
      if (mutateSlate(slate1, element, change)) {
        // actual change
        onChange(slateToMarkdown(slate1, { cache: syncCacheRef.current }));
        setSlate(slate1);
      }
    };
  }, [slate, onChange]);
  useEffect(() => {
    if (value == valueRef.current) return;
    valueRef.current = value;
    setSlate(markdownToSlate(value, false, syncCacheRef.current));
  }, [value]);

  const v: JSX.Element[] = [];
  let n = 0;
  for (const element of slate) {
    v.push(
      <RenderElement key={n} element={element} handleChange={handleChange} />
    );
    n += 1;
  }
  return <div style={{ width: "100%", ...style }}>{v}</div>;
}

function RenderElement({ element, handleChange }) {
  let children: JSX.Element[] = [];
  if (element["children"]) {
    let n = 0;
    for (const child of element["children"]) {
      children.push(
        <RenderElement key={n} element={child} handleChange={handleChange} />
      );
      n += 1;
    }
  }
  if (element["type"]) {
    const C = getStaticRender(element.type);
    return (
      <C
        children={children}
        element={element}
        attributes={{} as any}
        setElement={
          handleChange == null
            ? undefined
            : (change) => handleChange(element, change)
        }
      />
    );
  }
  // It's text
  return (
    <Leaf leaf={element} text={{} as any} attributes={{} as any}>
      {element["text"]}
    </Leaf>
  );
}

function mutateSlate(slate: any[], element, change): boolean {
  for (const elt of slate) {
    if (elt === element) {
      for (const key in change) {
        elt[key] = change[key];
      }
      return true;
    }
    if (elt.children != null) {
      if (mutateSlate(elt.children, element, change)) {
        return true;
      }
    }
  }
  return false;
}
