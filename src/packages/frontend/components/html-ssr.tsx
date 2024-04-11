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
import { Element, Text } from "domhandler";
import stripXSS, { safeAttrValue, whiteList } from "xss";
import type { IFilterXSSOptions } from "xss";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import DefaultMath from "@cocalc/frontend/components/math/ssr";
import { MathJaxConfig } from "@cocalc/util/mathjax-config";
import { decodeHTML } from "entities";

const URL_TAGS = ["src", "href", "data"];

const MATH_SKIP_TAGS = new Set<string>(MathJaxConfig.tex2jax.skipTags);

function getXSSOptions(urlTransform): IFilterXSSOptions | undefined {
  // - stripIgnoreTagBody - completely get rid of dangerous HTML
  //   (otherwise user sees weird mangled style code, when seeing
  //   nothing would be better).
  // - whiteList - we need iframes, though we lock them down as
  //   much as possible, while still supporting 3d graphics.
  return {
    stripIgnoreTagBody: true,
    // SECURITY: whitelist note -- we had tried to explicitly allow mathjax script tags in sanitized html
    // by whitelisting and scanning.  However, this didn't properly work (perhaps due to some update)
    // and resulted in a security vulnerability:
    //    https://github.com/sagemathinc/cocalc/security/advisories/GHSA-8w44-hggw-p5rf
    // The fix is completley removing any whitelisting of any script tags.  The feature of
    // mathjax in html is not important enough to support, and too dangerous -- even if it worked,
    // it would probably be an easy attack vector by just making up fake mathjax.
    whiteList: {
      ...whiteList,
      iframe: ["src", "srcdoc", "width", "height"],
      html: [],
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
  inline,
}: {
  value: string;
  style?: React.CSSProperties;
  inline?: boolean;
}) {
  const { urlTransform, AnchorTagComponent, noSanitize, MathComponent } =
    useFileContext();
  if (!noSanitize) {
    value = stripXSS(value, getXSSOptions(urlTransform));
  }
  if (value.trimLeft().startsWith("<html>")) {
    // Sage output formulas are wrapped in "<html>" for some stupid reason, which
    // probably originates with a ridiculous design choice that Tom Boothby or I
    // made in 2006 related to "wiki" formatting in Sage notebooks.  If we don't strip
    // this, then htmlReactParser just deletes the whole documents, since html is
    // not a valid tag inside the DOM.  We do this in a really minimally flexible way
    // to reduce the chances to 0 that we apply this when we shouldn't.
    value = value.trim().slice("<html>".length, -"</html>".length);
  }
  let options: any = {};
  options.replace = (domNode) => {
    // console.log("domNode = ", domNode);
    if (!/^[a-zA-Z]+[0-9]?$/.test(domNode.name)) {
      // Without this, if user gives html input that is a malformed tag then all of React
      // completely crashes, which is not desirable for us.  On the other hand, I prefer not
      // to always completely sanitize input, since that can do a lot we don't want to do
      // and may be expensive. See
      //   https://github.com/remarkablemark/html-react-parser/issues/60#issuecomment-398588573
      return React.createElement(React.Fragment);
    }
    if (domNode instanceof Text) {
      if (hasAncestor(domNode, MATH_SKIP_TAGS)) {
        // Do NOT convert Text to math inside a pre/code tree environment.
        return;
      }
      const { data } = domNode;
      if (MathComponent != null) {
        return <MathComponent data={decodeHTML(data)} />;
      }
      return <DefaultMath data={decodeHTML(data)} />;
    }

    if (!(domNode instanceof Element)) return;

    const { name, children, attribs } = domNode;

    if (name == "script") {
      const type = domNode.attribs?.type?.toLowerCase();
      if (type?.startsWith("math/tex")) {
        const child = domNode.children?.[0];
        if (child instanceof Text && child.data) {
          let data = "$" + decodeHTML(child.data) + "$";
          if (type.includes("display")) {
            data = "$" + data + "$";
          }
          if (MathComponent != null) {
            return <MathComponent data={data} />;
          }
          return <DefaultMath data={data} />;
        }
      }
    }

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
      // TODO: Except this is a security issue, since
      // combining allow-scripts & allow-same-origin makes it
      // possible to remove a lot of sandboxing.
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
                : undefined,
            );
          }
        }
      }
    }
  };
  if (inline) {
    return <span style={style}>{htmlReactParser(value, options)}</span>;
  } else {
    return <div style={style}>{htmlReactParser(value, options)}</div>;
  }
}

function hasAncestor(domNode, tags: Set<string>): boolean {
  const { parent } = domNode;
  if (!(parent instanceof Element)) return false;
  if (tags.has(parent.name)) return true;
  return hasAncestor(parent, tags);
}
