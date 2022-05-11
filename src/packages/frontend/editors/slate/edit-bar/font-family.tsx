import { BUTTON_STYLE } from "./marks-bar";
import { formatAction } from "../format";
import FontFamilyMenu from "@cocalc/frontend/components/font-family";

export default function Component({ editor }) {
  return (
    <FontFamilyMenu
      style={{ ...BUTTON_STYLE, height: "24px", width: "46px", padding: 0 }}
      onClick={(font_family) => {
        formatAction(editor, "font_family", font_family);
      }}
    />
  );
}
