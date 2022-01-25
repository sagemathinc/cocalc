import { ReactNode } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";

interface Props {
  children: ReactNode;
  id: string;
  readOnly?: boolean;
  selectable?: boolean;
}

export default function NotFocused({
  children,
  id,
  readOnly,
  selectable,
}: Props) {
  const frame = useFrameContext();
  return (
    <div
      style={{ width: "100%", height: "100%" }}
      onClick={
        !readOnly && selectable
          ? (e) => {
              e.stopPropagation();
              (frame.actions as Actions).setFocusedElement(frame.id, id);
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
