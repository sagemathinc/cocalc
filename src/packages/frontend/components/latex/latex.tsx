import { CSSProperties } from "react";
import { convertToHtml } from "@unified-latex/unified-latex-to-hast";
import { parse } from "@unified-latex/unified-latex-util-parse";
import htmlReactParser, { domToReact } from "html-react-parser";
import { Element, Text } from "domhandler";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import DefaultMath from "@cocalc/frontend/components/math/ssr";

type State = any;

interface Props {
  value: string;
  state?: State;
  isInline?: boolean;
  style?: CSSProperties;
}

export default function LaTeX({ value, isInline, style, state = {} }: Props) {
  const { MathComponent } = useFileContext();

  // console.log("LaTeX: ", { isInline, value });
  const ast = parse(value);
  const html = convertToHtml(ast);

  const options = {
    replace: (node) => {
      // console.log("node = ", node);
      if (!(node instanceof Element)) return;
      const { attribs, children, name, type } = node;
      if (type != "tag") return;
      if (
        (attribs["class"] == "display-math" ||
          attribs["class"] == "inline-math") &&
        children[0] instanceof Text &&
        children[0].data
      ) {
        let data = "$" + children[0].data + "$";
        if (attribs["class"] == "display-math") {
          data = "$" + data + "$";
        }
        if (MathComponent != null) {
          return <MathComponent data={data} />;
        }
        return <DefaultMath data={data} />;
      }
      if (
        attribs["class"] != "starred" &&
        (name == "h3" || name == "h4" || name == "h5")
      ) {
        const env =
          name == "h3"
            ? "section"
            : name == "h4"
            ? "subsection"
            : name == "h5"
            ? "subsubsection"
            : "";
        // these come from chapter/section/subsection/subsection in unified-latex
        if (state.section == null) {
          state.section = 0;
          state.subsection = state.subsubsection = 1;
        }
        if (env == "section") {
          state.section += 1;
          state.subsection = 0;
          state.subsubsection = 0;
          return (
            <h3>
              {state.section} {domToReact(children, options)}
            </h3>
          );
        } else if (env == "subsection") {
          state.subsection += 1;
          state.subsubsection = 0;
          return (
            <h4>
              {state.section}.{state.subsection} {domToReact(children, options)}
            </h4>
          );
        } else if (env == "subsubsection") {
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
