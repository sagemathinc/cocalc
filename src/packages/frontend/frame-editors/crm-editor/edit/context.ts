import { createContext, useContext } from "react";

export interface EditableContextType {
  counter: number;
  save: (obj: object, change: object) => Promise<void>;
}

async function save(_obj: object, _change: object): Promise<void> {
  throw Error("please try to save again later");
}

export const EditableContext = createContext<EditableContextType>({
  counter: 0,
  save,
});

export function useEditableContext() {
  return useContext(EditableContext);
}
