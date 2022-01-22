import { ReactNode } from "react";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";

interface Props {
  children: ReactNode;
  id: string;
  readOnly?: boolean;
}

export default function NotFocused({ children, id, readOnly }: Props) {
  const frame = useFrameContext();
  return (
    <div
      onClick={
        !readOnly
          ? () => {
              (frame.actions as Actions).setFocusedElement(frame.id, id);
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
