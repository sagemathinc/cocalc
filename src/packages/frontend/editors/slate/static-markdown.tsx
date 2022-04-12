/*
Static Markdown

This is a react component that renders markdown text using React.  See the
comments in mostly-static-markdown.tsx for more details, since that's a very
similar, but more complicated component.

A constraint of this component is that it should easily render in the next.js
application.
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
