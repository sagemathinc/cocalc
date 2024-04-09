import { Paragraph } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

export function RawPrompt({ input }) {
  return (
    <Paragraph
      style={{
        border: "1px solid lightgrey",
        borderRadius: "5px",
        margin: "5px 0",
        padding: "10px",
        overflowY: "auto",
        maxHeight: "150px",
        fontSize: "85%",
        fontFamily: "monospace",
        whiteSpace: "pre-wrap",
        color: COLORS.GRAY_M,
      }}
    >
      {input}
    </Paragraph>
  );
}
