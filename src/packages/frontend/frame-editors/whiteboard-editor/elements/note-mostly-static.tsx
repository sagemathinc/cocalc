/*
"Mostly" static notes - fast rendering since they are static, but with some
support for interactive elements, e.g., checkboxes.

These can't be used with the nextjs app, which is why this is separate from note-static.tsx
*/

import { CSSProperties } from "react";
import Text from "./text-mostly-static";
import { DEFAULT_NOTE } from "../tools/defaults";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { Props } from "./render-static";

interface Props1 extends Props {
  readOnly?: boolean;
}

export const STYLE = {
  borderBottomRightRadius: "60px 5px",
  boxShadow: "1px 5px 7px rgb(33 33 33 / 70%)",
  width: "100%",
  border: "1px solid lightgrey",
  overflow: "hidden",
} as CSSProperties;

export default function Note({ element, readOnly }: Props1) {
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
      <Text element={{ ...element, data }} readOnly={readOnly} />
    </div>
  );
}
