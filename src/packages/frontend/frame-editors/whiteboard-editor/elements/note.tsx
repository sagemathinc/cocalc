import { useEffect, useRef } from "react";
import Text from "./text";
import NoteStatic, { STYLE } from "./note-mostly-static";
import { DEFAULT_NOTE } from "../tools/defaults";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { useFrameContext } from "../hooks";
import { Props } from "./render";

const NOTE_HEIGHT_OFFSET = 22;

export default function Note(props: Props) {
  const { element } = props;
  const { actions } = useFrameContext();
  const noteRef = useRef<HTMLDivElement>(null);
  const isStatic =
    (props.readOnly || !props.focused || props.element.locked) &&
    props.cursors == null;

  // Re-measure height when switching to unfocused rendering.
  // TextEditor unmounts for notes, so we must measure here.
  useEffect(() => {
    if (!isStatic) return;
    const elt = noteRef.current;
    if (elt == null) return;
    const measure = () => {
      const el = noteRef.current;
      if (!el) return;
      const h = el.getBoundingClientRect().height / props.canvasScale;
      if (Math.abs(h - (element.h ?? 0)) > 2) {
        actions.setElement({
          obj: { id: element.id, h },
          commit: true,
        });
      }
    };
    // Wait a beat for the static content to render, then measure.
    const timeout = setTimeout(measure, 100);
    return () => clearTimeout(timeout);
  }, [isStatic, element.id, props.canvasScale]);

  if (isStatic) {
    return (
      <div ref={noteRef}>
        <NoteStatic element={element} />
      </div>
    );
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
      <Text
        {...props}
        element={{ ...element, data }}
        heightOffset={NOTE_HEIGHT_OFFSET}
      />
    </div>
  );
}
