import latexToSlate from "./to-slate";
import RenderStatic from "@cocalc/frontend/editors/slate/render-static";

type State = any;

interface Props {
  value: string;
  state?: State;
}

export default function LaTeX({ value }: Props) {
  const slate = latexToSlate(value);
  return <RenderStatic slate={slate} />;
}
