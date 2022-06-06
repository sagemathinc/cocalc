import { CSSProperties } from "react";
import { convertToHtml } from "@unified-latex/unified-latex-to-hast";
import { parse } from "@unified-latex/unified-latex-util-parse";
import htmlReactParser, { domToReact } from "html-react-parser";
import { Element, Text } from "domhandler";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import DefaultMath from "@cocalc/frontend/components/math/ssr";

interface Props {
  value: string;
  isInline?: boolean;
  style?: CSSProperties;
}

export default function LaTeX({ value, isInline, style }: Props) {
  const { MathComponent, latexState } = useFileContext();
  const state = latexState ?? {};

  // console.log("LaTeX: ", { isInline, value });
  // https://siefkenj.github.io/latex-parser-playground/
  const ast = parse(value);
  const html = convertToHtml(ast);

  const options = {
    replace: (node) => {
      // console.log("node = ", node);
      if (!(node instanceof Element)) return;
      const { attribs, children, name, type } = node;
      if (type != "tag") return;

      const classes =
        attribs?.["class"] != null
          ? new Set(attribs["class"].split(" "))
          : new Set([]);

      if (
        (classes.has("display-math") || classes.has("inline-math")) &&
        children[0] instanceof Text &&
        children[0].data
      ) {
        let data = "$" + children[0].data + "$";
        if (classes.has("display-math")) {
          data = "$" + data + "$";
        }
        if (MathComponent != null) {
          return <MathComponent data={data} />;
        }
        return <DefaultMath data={data} />;
      }

      if (classes.has("macro")) {
        if (classes.has("macro-label") && children[0] instanceof Text) {
          // create a label
          if (state.refs == null) {
            state.refs = {};
          }
          let value = "";
          if (state.level == null) {
            // not in a section
            value = "";
          } else if (state.level == "section") {
            value = `${state.section}`;
          } else if (state.level == "subsection") {
            value = `${state.section}.${state.subsection}`;
          } else if (state.level == "subsubsection") {
            value = `${state.section}.${state.subsection}.${state.subsubsection}`;
          } else {
            // TODO...
            value = `${state.section}.${state.subsection}.${state.subsubsection}`;
          }

          state.refs[children[0].data] = value;
          return <span></span>;
        } else if (classes.has("macro-ref") && children[0] instanceof Text) {
          // reference a label
          return <span>{state.refs?.[children[0].data] ?? <b>??</b>}</span>;
        }
      }

      if (
        attribs["class"] != "starred" &&
        (name == "h3" || name == "h4" || name == "h5")
      ) {
        const level =
          name == "h3"
            ? "section"
            : name == "h4"
            ? "subsection"
            : name == "h5"
            ? "subsubsection"
            : "";
        // these come from chapter/section/subsection/subsection in unified-latex
        state.level = level;
        if (state.section == null) {
          state.section = 0;
          state.subsection = state.subsubsection = 1;
        }
        if (level == "section") {
          state.section += 1;
          state.subsection = 0;
          state.subsubsection = 0;
          return (
            <h3>
              {state.section} {domToReact(children, options)}
            </h3>
          );
        } else if (level == "subsection") {
          state.subsection += 1;
          state.subsubsection = 0;
          return (
            <h4>
              {state.section}.{state.subsection} {domToReact(children, options)}
            </h4>
          );
        } else if (level == "subsubsection") {
          state.subsubsection += 1;
          return (
            <h4>
              {state.section}.{state.subsection}.{state.subsubsection}{" "}
              {domToReact(children, options)}
            </h4>
          );
        }
      }
    },
  };

  if (isInline) {
    return <span style={style}>{htmlReactParser(html, options)}</span>;
  } else {
    return <div style={style}>{htmlReactParser(html, options)}</div>;
  }
}
