import { BUTTON_STYLE } from "./marks-bar";
import { formatAction } from "../format";
import { ColorButton } from "@cocalc/frontend/components/color-picker";

export default function Component({ editor }) {
  return (
    <ColorButton
      type="text"
      style={BUTTON_STYLE}
      onChange={(color) => {
        formatAction(editor, "color", color);
      }}
    />
  );
}
