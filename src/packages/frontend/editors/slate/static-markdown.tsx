/*
Static Markdown

This is a react component that renders markdown text using React.  See the
comments in mostly-static-markdown.tsx for more details, since that's a very
similar, but more complicated component.

A constraint of this component is that it should easily render in the next.js
application.
*/

import { CSSProperties, useEffect, useState } from "react";
import "./elements/init-ssr";
import { getStaticRender } from "./elements/register";
import { markdown_to_slate as markdownToSlate } from "./markdown-to-slate";
import Leaf from "./leaf";
import { ChangeContext } from "./use-change";

interface Props {
  value: string;
  style?: CSSProperties;
  className?: string;
}

export default function StaticMarkdown(props: Props) {
  const { value, style, className } = props;

  const [change, setChange] = useState<number>(0);
  useEffect(() => {
    setChange(change + 1);
  }, [value]);

  // Convert markdown to our slate JSON object representation.
  const children = markdownToSlate(value);
  return (
    <ChangeContext.Provider value={{ change, editor: { children } as any }}>
      <div style={{ width: "100%", ...style }} className={className}>
        {children.map((element, n) => {
          return <RenderElement key={n} element={element} />;
        })}
      </div>
    </ChangeContext.Provider>
  );
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
