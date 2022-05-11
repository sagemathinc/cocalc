import Text from "./text";
import NoteStatic, { STYLE } from "./note-mostly-static";
import { DEFAULT_NOTE } from "../tools/defaults";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { Props } from "./render";

export default function Note(props: Props) {
  const { element } = props;
  if (
    (props.readOnly || !props.focused || props.element.locked) &&
    props.cursors == null
  ) {
    return <NoteStatic element={element} />;
  }
  const data = {
    ...element.data,
    color: avatar_fontcolor(element.data?.color),
  };
  return (
    <div
      style={{
        ...STYLE,
        overflow: "visible",
        background: element.data?.color ?? DEFAULT_NOTE.color,
        padding: "10px",
      }}
    >
      <Text {...props} element={{ ...element, data }} />
    </div>
  );
}
