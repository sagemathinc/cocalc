import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

export default function Generic({ element }) {
  return (
    <StaticMarkdown
      value={"```js\n" + JSON.stringify(element, undefined, 2) + "\n```"}
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
}
