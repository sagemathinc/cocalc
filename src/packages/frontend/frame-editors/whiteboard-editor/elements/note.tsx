import Text from "./text";

import { DEFAULT_NOTE } from "../tools/note";

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
  return (
    <div
      style={{
        ...STYLE,
        fontSize: element.data?.fontSize,
        background: element.data?.color ?? DEFAULT_NOTE.color,
      }}
    >
      <Text element={element} focused={focused} />
    </div>
  );
}
