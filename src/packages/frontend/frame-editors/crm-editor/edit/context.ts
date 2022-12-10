import { createContext, useContext } from "react";

export const EditableContext = createContext<any>(null);

export function useEditableContext() {
  return useContext(EditableContext);
}
