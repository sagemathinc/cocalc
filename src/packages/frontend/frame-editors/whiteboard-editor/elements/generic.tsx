import { Markdown } from "@cocalc/frontend/components";

export default function Generic({ element, focused }) {
  focused = focused;
  return (
    <Markdown
      value={"```js\n" + JSON.stringify(element, undefined, 2) + "\n```"}
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  );
}
