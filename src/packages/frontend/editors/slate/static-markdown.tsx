/*
Static Markdown

This is a react component that renders markdown text using React.  See the
comments in mostly-static-markdown.tsx for more details, since that's a very
similar, but more complicated component.

A constraint of this component is that it should easily render in the next.js
application.
*/

import { CSSProperties } from "react";
import RenderStatic from "./render-static";
import { markdown_to_slate as markdownToSlate } from "./markdown-to-slate";

interface Props {
  value: string;
  style?: CSSProperties;
  className?: string;
}

export default function StaticMarkdown({ value, style, className }: Props) {
  // Convert markdown to our slate JSON object representation.
  const slate = markdownToSlate(value);
  return <RenderStatic slate={slate} style={style} className={className} />;
}
