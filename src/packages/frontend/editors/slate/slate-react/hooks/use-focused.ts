import { createContext, useContext } from "react";

/**
 * A React context for sharing the `focused` state of the editor.
 * WARNING: For efficiency purposes it doesn't cause the component to update
 * when the state changes.
 */

export const FocusedContext = createContext({ isFocused: false });

/**
 * Get the current `focused` state of the editor.
 */

export const useFocused = (): boolean => {
  return useContext(FocusedContext).isFocused;
};
