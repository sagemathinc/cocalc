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
import { Element, Text } from "domhandler/lib/node";
import stripXSS, { safeAttrValue, whiteList } from "xss";
import type { IFilterXSSOptions } from "xss";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import DefaultMath from "@cocalc/frontend/components/math/ssr";

const URL_TAGS = ["src", "href", "data"];

function getXSSOptions(urlTransform): IFilterXSSOptions | undefined {
  // - stripIgnoreTagBody - completely get rid of dangerous HTML
  //   (otherwise user sees weird mangled style code, when seeing
  //   nothing would be better).
  // - whiteList - we need iframes, though we lock them down as
  //   much as possible, while still supporting 3d graphics.
  return {
    stripIgnoreTagBody: true,
    whiteList: {
      ...whiteList,
      iframe: ["src", "srcdoc", "width", "height"],
    },
    safeAttrValue: (tag, name, value) => {
      if (tag == "iframe" && name == "srcdoc") {
        // important not to mangle this or it won't work.
        return value;
      }
      if (urlTransform && URL_TAGS.includes(name)) {
        // use the url transform
        return urlTransform(value, tag, name) ?? value;
      }
      // fallback to the builtin version
      return safeAttrValue(tag, name, value, false as any);
    },
  };
}

export default function HTML({
  value,
  style,
}: {
  value: string;
  style?: React.CSSProperties;
}) {
  const { urlTransform, AnchorTagComponent, noSanitize, MathComponent } =
    useFileContext();
  if (!noSanitize) {
    value = stripXSS(value, getXSSOptions(urlTransform));
  }
  let options: any = {};
  options.replace = (domNode) => {
    if (domNode instanceof Text) {
      const { data } = domNode;
      if (MathComponent != null) {
        return <MathComponent data={data} />;
      }
      return <DefaultMath data={data} />;
    }

    if (!(domNode instanceof Element)) return;

    const { name, children, attribs } = domNode;
    if (AnchorTagComponent != null && name == "a") {
      return (
        <AnchorTagComponent {...attribs}>
          {domToReact(children, options)}
        </AnchorTagComponent>
      );
    }
    if (name == "iframe") {
      // We sandbox and minimize what we allow.  Don't
      // use {...attribs} due to srcDoc vs srcdoc.
      // We don't allow setting the style, since that leads
      // to a lot of attacks (i.e., making the iframe move in a
      // sneaky way).  We have to allow-same-origin or scripts
      // won't work at all, which is one of the main uses for
      // iframes.  A good test is 3d graphics in Sage kernel
      // Jupyter notebooks.
      return (
        <iframe
          src={attribs.src}
          srcDoc={attribs.srcdoc}
          width={attribs.width}
          height={attribs.height}
          sandbox="allow-forms allow-scripts allow-same-origin"
        />
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
  return <div style={style}>{htmlReactParser(value, options)}</div>;
}
