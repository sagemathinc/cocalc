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
  Element,
  Text,
} from "html-react-parser";
import sanitizeHtml from "sanitize-html";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import DefaultMath from "@cocalc/frontend/components/math/ssr";
import { MathJaxConfig } from "@cocalc/util/mathjax-config";
import { decodeHTML } from "entities";

const URL_ATTRIBS = ["src", "href", "data"];
const MATH_SKIP_TAGS = new Set<string>(MathJaxConfig.tex2jax.skipTags);

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
    value = sanitizeHtml(value, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "iframe"]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        iframe: [
          "src",
          "width",
          "height",
          "title",
          "allow",
          "allowfullscreen",
          "referrerpolicy",
          "loading",
          "frameborder",
        ],
      },
      allowedIframeHostnames: [
        "www.youtube.com",
        "youtube.com",
        "www.youtube-nocookie.com",
        "youtube-nocookie.com",
        "player.vimeo.com",
      ],
    });
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

    try {
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
            {domToReact(children as any, options)}
          </AnchorTagComponent>
        );
      }

      if (noSanitize && urlTransform != null && attribs != null) {
        // since we did not sanitize the HTML (which also does urlTransform),
        // we have to do the urlTransform here instead.
        for (const attrib of URL_ATTRIBS) {
          if (attribs[attrib] != null) {
            const x = urlTransform(attribs[attrib]);
            if (x != null) {
              const props = attributesToProps(attribs);
              props[attrib] = x;
              return React.createElement(
                name,
                props,
                children && children?.length > 0
                  ? domToReact(children as any, options)
                  : undefined,
              );
            }
          }
        }
      }
    } catch (err) {
      console.log("WARNING -- issue parsing HTML", err);
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
