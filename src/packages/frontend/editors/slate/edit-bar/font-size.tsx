import { BUTTON_STYLE } from "./marks-bar";
import { formatAction } from "../format";
import FontSizeMenu from "@cocalc/frontend/components/font-size";

export default function Component({ editor, size }) {
  return (
    <FontSizeMenu
      style={{
        ...BUTTON_STYLE,
        height: "24px",
        width: "46px",
        padding: 0,
        background: size ? "#ccc" : undefined,
      }}
      onClick={(font_size) => {
        formatAction(editor, "font_size", font_size);
      }}
    />
  );
}
