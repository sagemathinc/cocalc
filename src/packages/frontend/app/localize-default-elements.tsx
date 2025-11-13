import { Typography } from "antd";

export const { Text, Title, Paragraph } = Typography;

const uniqueKey: { [tag: string]: number } = {};

// Note: this is e.g. necessary to render text in a modal, where some caching happens, apparently
function getKey(tag: string): number {
  const n = (uniqueKey[tag] ?? 0) + 1;
  uniqueKey[tag] = n;
  return n;
}

export const LOCALIZE_DEFAULT_ELEMENTS = {
  strong: (ch) => (
    <Text strong key={getKey("strong")}>
      {ch}
    </Text>
  ),
  b: (ch) => (
    <Text strong key={getKey("b")}>
      {ch}
    </Text>
  ),
  i: (ch) => (
    <Text italic key={getKey("i")}>
      {ch}
    </Text>
  ),
  p: (ch) => <Paragraph key={getKey("p")}>{ch}</Paragraph>,
  code: (ch) => (
    <Text code key={getKey("code")}>
      {ch}
    </Text>
  ),
  ul: (e) => <ul key={getKey("ul")}>{e}</ul>,
  ol: (e) => <ol key={getKey("ol")}>{e}</ol>,
  li: (e) => <li key={getKey("li")}>{e}</li>,
} as const;
