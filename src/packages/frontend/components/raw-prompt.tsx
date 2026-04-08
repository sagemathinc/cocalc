import { CSS } from "@cocalc/frontend/app-framework";
import { useBottomScroller } from "@cocalc/frontend/app-framework/use-bottom-scroller";
import { Paragraph } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { COLORS } from "@cocalc/util/theme";

const STYLE = {
  border: "1px solid var(--cocalc-border-light, lightgray)",
  borderRadius: "5px",
  margin: "5px 0",
  padding: "10px",
  overflowY: "auto",
  maxHeight: "150px",
  fontSize: "85%",
  fontFamily: "monospace",
  whiteSpace: "pre-wrap",
  color: "var(--cocalc-text-primary, #5f5f5f)",
} as const;

interface Props {
  input: React.JSX.Element | string;
  style?: CSS;
  scrollBottom?: boolean;
  rawText?: boolean;
}

export function RawPrompt({
  input,
  style: style0,
  scrollBottom = false,
  rawText = false,
}: Props) {
  const ref = useBottomScroller(scrollBottom, input);
  const style = { ...STYLE, ...style0 };
  if (typeof input == "string" && !rawText) {
    // this looks so much nicer; I realize it doesn't implement scrollBottom.
    // But just dropping the input as plain text like below just seems
    // utterly broken!
    return <StaticMarkdown style={style} value={input} />;
  } else {
    return (
      <Paragraph ref={ref} style={style}>
        {input}
      </Paragraph>
    );
  }
}
