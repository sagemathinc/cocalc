import latexToSlate from "./to-slate";
import RenderStatic from "@cocalc/frontend/editors/slate/render-static";

type State = any;

interface Props {
  value: string;
  state?: State;
  isInline?: boolean;
}

export function LaTeX({ value }: Props) {
  const slate = latexToSlate(value);
  return <RenderStatic slate={slate} />;
}

import { convertToHtml } from "@unified-latex/unified-latex-to-hast";
import { parse } from "@unified-latex/unified-latex-util-parse";
import HTML from "@cocalc/frontend/components/html-ssr";

export default function LaTeXViaHTML({ value, isInline }: Props) {
  // console.log("LaTeX: ", { isInline, value });
  const latexAst = parse(value);
  const htmlString = convertToHtml(latexAst);
  return <HTML value={htmlString} isInline={isInline} />;
}
