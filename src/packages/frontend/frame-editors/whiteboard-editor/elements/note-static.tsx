import { CSSProperties } from "react";
import Text from "./text-static";
import { DEFAULT_NOTE } from "../tools/defaults";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { Props } from "./render-static";

export const STYLE = {
  borderBottomRightRadius: "60px 5px",
  boxShadow: "1px 5px 7px rgb(33 33 33 / 70%)",
  width: "100%",
  border: "1px solid lightgrey",
  overflow: "hidden",
} as CSSProperties;

export default function Note({ element }: Props) {
  const data = {
    ...element.data,
    color: avatar_fontcolor(element.data?.color),
  };
  return (
    <div
      style={{
        ...STYLE,
        background: element.data?.color ?? DEFAULT_NOTE.color,
        padding: "10px",
      }}
    >
      <Text element={{ ...element, data }} />
    </div>
  );
}
