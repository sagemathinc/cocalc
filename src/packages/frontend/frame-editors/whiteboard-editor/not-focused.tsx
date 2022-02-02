import { ReactNode } from "react";
import { useFrameContext } from "./hooks";

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
              frame.actions.setSelection(
                frame.id,
                id,
                e.altKey || e.metaKey || e.ctrlKey || e.shiftKey
                  ? "toggle"
                  : "only"
              );
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
