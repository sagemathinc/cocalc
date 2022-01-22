import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";

export default function NotFocused({ children, id }) {
  const frameContext = useFrameContext();
  return (
    <div
      onClick={() => {
        (frameContext.actions as Actions).setFocusedElement(
          frameContext.id,
          id
        );
      }}
    >
      {children}
    </div>
  );
}
