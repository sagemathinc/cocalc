import { createContext, useContext } from "react";

export interface EditableContextType {
  counter?: number;
  save?: (obj: object, change: object) => Promise<void>;
}

export const EditableContext = createContext<EditableContextType>({});

export function useEditableContext() {
  return useContext(EditableContext);
}
