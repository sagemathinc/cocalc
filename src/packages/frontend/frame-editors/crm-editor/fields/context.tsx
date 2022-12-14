import { Alert, Button, Tooltip } from "antd";
import { fieldToLabel } from "../util";
import {
  createContext,
  FC,
  ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

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

export function useEditableContext<ValueType>(field: string): {
  edit: boolean;
  setEdit: (boolean) => void;
  saving: boolean;
  setSaving: (boolean) => void;
  error?: ReactNode;
  save: (obj: object, value: ValueType | undefined) => Promise<void>;
  counter: number;
  ClickToEdit: FC<{
    empty?: boolean;
    children?;
  }>;
} {
  const context = useContext(EditableContext);
  const [edit, setEdit] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const lastSaveRef = useRef<{
    obj: object;
    value: ValueType | undefined;
  } | null>(null);

  const save = useMemo(() => {
    return async (obj: object, value: ValueType | undefined) => {
      lastSaveRef.current = { obj, value };
      try {
        setError("");
        setSaving(true);
        // TODO:
        await context.save(obj, { [field]: value });
        setEdit(false);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setSaving(false);
      }
    };
  }, [field]);

  return {
    edit,
    setEdit,
    saving,
    setSaving,
    ClickToEdit: (props) => (
      <ClickToEdit setEdit={setEdit} field={field} {...props} />
    ),
    error: error ? (
      <Alert
        type="error"
        message={
          <>
            {error}{" "}
            <Button
              size="small"
              onClick={() => {
                if (lastSaveRef.current == null) return;
                // slightly worrisome...
                save(lastSaveRef.current.obj, lastSaveRef.current.value);
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

function ClickToEdit({
  empty,
  children,
  field,
  setEdit,
}: {
  field: string;
  empty?: boolean;
  children?;
  setEdit: (boolean) => void;
}) {
  return (
    <Tooltip
      title={`Click to edit ${fieldToLabel(field)}`}
      placement="left"
      mouseEnterDelay={0.7}
    >
      <div
        style={{
          display: "inline-block",
          cursor: "pointer",
          minWidth: "5em",
          minHeight: "1.5em",
          ...(empty
            ? {
                border: "1px solid #eee",
                borderRadius: "3px",
              }
            : undefined),
        }}
        onClick={() => setEdit(true)}
      >
        {empty || children == null || children.length == 0 ? (
          <span style={{ color: "#aaa" }}>{fieldToLabel(field)}...</span>
        ) : (
          children
        )}
      </div>
    </Tooltip>
  );
}
