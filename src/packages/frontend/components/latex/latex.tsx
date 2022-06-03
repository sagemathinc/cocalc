import latexToSlate from "./to-slate";

type State = any;

interface Props {
  value: string;
  state?: State;
}

export default function LaTeX({ value }: Props) {
  const p = latexToSlate(value);
  return <pre>{JSON.stringify(p, undefined, 2)}</pre>;
}
