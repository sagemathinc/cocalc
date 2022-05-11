import { BUTTON_STYLE } from "./marks-bar";
import { formatAction } from "../format";
import HeadingMenu from "@cocalc/frontend/components/heading-menu";

export default function Component({ editor }) {
  return (
    <HeadingMenu
      style={{ ...BUTTON_STYLE, height: "24px", width: "46px", padding: 0 }}
      onClick={(heading) => {
        formatAction(editor, `format_heading_${heading}`, []);
      }}
    />
  );
}
