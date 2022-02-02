import Text from "./text";
import { DEFAULT_NOTE } from "../tools/note";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";

export const STYLE = {
  borderBottomRightRadius: "60px 5px",
  boxShadow: "1px 5px 7px rgb(33 33 33 / 70%)",
  padding: "15px",
  width: "100%",
  height: "100%",
  border: "1px solid lightgrey",
  overflow: "hidden",
};

export default function Note({ element, focused }) {
  // TODO: also use white color in some cases for text.
  const data = {
    ...element.data,
    color: avatar_fontcolor(element.data?.color),
  };
  return (
    <div
      style={{
        ...STYLE,
        background: element.data?.color ?? DEFAULT_NOTE.color,
      }}
    >
      <Text element={{ ...element, data }} focused={focused} />
    </div>
  );
}
