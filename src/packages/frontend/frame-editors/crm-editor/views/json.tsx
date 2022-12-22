import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface Props {
  obj: object;
}

export default function Json({ obj }: Props) {
  return (
    <StaticMarkdown
      value={"```js\n" + JSON.stringify(obj, undefined, 2) + "\n```"}
    />
  );
}
