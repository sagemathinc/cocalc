import { Alert, Button, Tooltip } from "antd";
import { fieldToLabel } from "../util";
import {
  CSSProperties,
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
    value: ValueType | null | undefined;
  } | null>(null);

  const save = useMemo(() => {
    // value = undefined/null cause that column to have the value set to NULL in postgres
    return async (obj: object, value: ValueType | undefined | null) => {
      lastSaveRef.current = { obj, value };
      try {
        setError("");
        setSaving(true);
        // TODO:
        await context.save(obj, { [field]: value ?? null });
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
  style,
}: {
  field: string;
  empty?: boolean;
  children?;
  setEdit: (boolean) => void;
  style?: CSSProperties;
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
          maxHeight: "10em",
          overflowY: "auto",
          width: "100%",
          ...(empty
            ? {
                border: "1px solid #ddd",
                borderRadius: "3px",
                padding: "5px",
              }
            : undefined),
          ...style,
        }}
        onClick={() => setEdit(true)}
      >
        {empty || children == null || children.length == 0 ? (
          <span style={{ color: "#888" }}>{fieldToLabel(field)}...</span>
        ) : (
          children
        )}
      </div>
    </Tooltip>
  );
}
