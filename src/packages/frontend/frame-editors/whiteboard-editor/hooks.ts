import {
  useFrameContext as useFrameContextGeneric,
  IFrameContext,
} from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { Actions } from "./actions";

// https://stackoverflow.com/questions/41285211/overriding-interface-property-type-defined-in-typescript-d-ts-file
type Modify<T, R> = Omit<T, keyof R> & R;

type WhiteboardFrameContext = Modify<
  IFrameContext,
  {
    actions: Actions;
  }
>;

export function useFrameContext(): WhiteboardFrameContext {
  return useFrameContextGeneric() as WhiteboardFrameContext;
}
