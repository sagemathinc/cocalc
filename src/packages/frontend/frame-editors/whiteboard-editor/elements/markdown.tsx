import { Markdown as StaticMarkdown } from "@cocalc/frontend/components";

export default function Markdown({ element, focused }) {
  return <StaticMarkdown value={element.str} />;
}
