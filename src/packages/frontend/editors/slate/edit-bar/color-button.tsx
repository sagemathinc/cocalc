import { BUTTON_STYLE } from "./marks-bar";
import { formatAction } from "../format";
import { ColorButton } from "@cocalc/frontend/components/color-picker";

export default function Component({ editor, color }) {
  return (
    <ColorButton
      type="text"
      style={{ ...BUTTON_STYLE, background: color }}
      onChange={(color) => {
        formatAction(editor, "color", color);
      }}
      onClick={() => {
        if (color) {
          formatAction(editor, "color", null);
          return true;
        }
      }}
    />
  );
}
