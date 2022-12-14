import { Alert, Button } from "antd";

import { createContext, ReactNode, useContext, useRef, useState } from "react";

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

export function useEditableContext(): {
  edit: boolean;
  setEdit: (boolean) => void;
  saving: boolean;
  setSaving: (boolean) => void;
  error?: ReactNode;
  save: (obj: object, change: object) => Promise<void>;
  counter: number;
} {
  const context = useContext(EditableContext);
  const [edit, setEdit] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const lastSaveRef = useRef<{ obj: object; change: object }>({
    obj: {},
    change: {},
  });
  async function save(obj: object, change: object) {
    lastSaveRef.current = { obj, change };
    try {
      setError("");
      setSaving(true);
      await context.save(obj, change);
      setEdit(false);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setSaving(false);
    }
  }
  return {
    edit,
    setEdit,
    saving,
    setSaving,
    error: error ? (
      <Alert
        type="error"
        message={
          <>
            {error}{" "}
            <Button
              size="small"
              onClick={() => {
                // slightly worrisome...
                save(lastSaveRef.current.obj, lastSaveRef.current.change);
              }}
            >
              try again
            </Button>
          </>
        }
      />
    ) : undefined,
    save,
    counter: context.counter,
  };
}
