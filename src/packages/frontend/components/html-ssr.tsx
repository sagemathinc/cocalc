/*
React component for rendering an HTML string.

- suitable for server side rendering (e.g., nextjs)
- parses and displays math using KaTeX
- sanitizes the HTML for XSS attacks, etc., so it is safe to display to users
- optionally transforms links

TODO: This should eventually completely replace ./html.tsx:
- syntax highlighting
- searching
- opens links in a new tab, or makes clicking anchor tags runs a function
  instead of opening a new tab so can open internal cocalc links inside cocalc.
*/

import React from "react";
import htmlReactParser, {
  attributesToProps,
  domToReact,
} from "html-react-parser";
import { Element } from "domhandler/lib/node";
import stripXSS from "xss";
import type { IFilterXSSOptions } from "xss";

import { math_escape, math_unescape } from "@cocalc/util/markdown-utils";
import { remove_math, replace_math } from "@cocalc/util/mathjax-utils";
import { latexMathToHtml } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";
import { useFileContext } from "@cocalc/frontend/lib/file-context";

interface Props {
  value: string;
  style?: React.CSSProperties;
}

export function HTML2({ value }: Props) {
  const [text, math] = remove_math(math_escape(value));
  for (let i = 0; i < math.length; i++) {
    math[i] = latexMathToHtml(math[i]);
  }
  // Substitute processed math back in.
  const __html = replace_all(
    math_unescape(replace_math(text, math)),
    "\\$",
    "$"
  );
  return <div dangerouslySetInnerHTML={{ __html }}></div>;
}

const URL_TAGS = ["src", "href", "data"];

function getXSSOptions(urlTransform): IFilterXSSOptions | undefined {
  if (urlTransform != null) {
    return {
      onTagAttr: (tag, name, value) => {
        if (URL_TAGS.includes(name)) {
          const s = `${name}="${urlTransform(value, tag, name) ?? value}"`;
          return s;
        }
      },
    };
  }
  return undefined;
}

export default function HTML({ value, style }: Props) {
  const { urlTransform, AnchorTagComponent, noSanitize } = useFileContext();
  if (!noSanitize) {
    value = stripXSS(value, getXSSOptions(urlTransform));
  }
  let options: any = {};
  if (AnchorTagComponent != null) {
    options.replace = (domNode) => {
      if (!(domNode instanceof Element)) return;
      const { name, children, attribs } = domNode;
      if (name == "a") {
        return (
          <AnchorTagComponent {...attribs}>
            {domToReact(children, options)}
          </AnchorTagComponent>
        );
      }
      if (noSanitize && urlTransform != null && attribs != null) {
        // since we did not sanitize the HTML (which also does urlTransform),
        // we have to do the urlTransform here instead.
        for (const tag of URL_TAGS) {
          if (attribs[tag] != null) {
            const x = urlTransform(attribs[tag]);
            if (x != null) {
              const props = attributesToProps(attribs);
              props[tag] = x;
              return React.createElement(
                name,
                props,
                children && children?.length > 0
                  ? domToReact(children, options)
                  : undefined
              );
            }
          }
        }
      }
    };
  }
  return <div style={style}>{htmlReactParser(value, options)}</div>;
}
