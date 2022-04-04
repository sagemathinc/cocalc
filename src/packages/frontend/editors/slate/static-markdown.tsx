/*
Static Markdown

This is a react component that renders markdown text using React. Unlike the
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
robust, secure, etc. Also, it's **possible** to use react-window to do windowing
and hence render very large documents, which isn't possible using straight HTML,
and we can do other things like section folding and table of contents in a natural
way with good code use!

Worries:

*/

import React from "react";
import "./elements/init-ssr";
import { getStaticRender } from "./elements/register";
import { markdown_to_slate as markdownToSlate } from "./markdown-to-slate";
import Leaf from "./leaf";

interface Props {
  value: string;
  style?: React.CSSProperties;
}

export default function StaticMarkdown({ value, style }: Props) {
  // Convert markdown to our slate JSON object representation.
  const slate = markdownToSlate(value);
  const v: JSX.Element[] = [];
  // console.log(JSON.stringify(slate, undefined, 2));
  let n = 0;
  for (const element of slate) {
    v.push(<RenderElement key={n} element={element} />);
    n += 1;
  }
  return <div style={{ width: "100%", ...style }}>{v}</div>;
}

function RenderElement({ element }) {
  let children: JSX.Element[] = [];
  if (element["children"]) {
    let n = 0;
    for (const child of element["children"]) {
      children.push(<RenderElement key={n} element={child} />);
      n += 1;
    }
  }
  if (element["type"]) {
    const C = getStaticRender(element.type);
    return <C children={children} element={element} attributes={{} as any} />;
  }
  // It's text
  return (
    <Leaf leaf={element} text={{} as any} attributes={{} as any}>
      {element["text"]}
    </Leaf>
  );
}
