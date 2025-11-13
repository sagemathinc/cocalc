import { Alert, Button, Space, Tooltip } from "antd";
import {
  createContext,
  CSSProperties,
  FC,
  ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useIntl } from "react-intl";
import { fieldToLabel } from "../util";

import { labels } from "@cocalc/frontend/i18n";

export interface EditableContextType {
  counter: number;
  save: (obj: object, change: object) => Promise<void>;
  refresh: Function;
}

async function save(_obj: object, _change: object): Promise<void> {
  throw Error("please try to save again later");
}

export const EditableContext = createContext<EditableContextType>({
  counter: 0,
  refresh: () => {},
  save,
});

export function useEditableContext<ValueType>(field: string): {
  edit: boolean;
  setEdit: (boolean) => void;
  saving: boolean;
  setSaving: (boolean) => void;
  error?: ReactNode;
  setError: (ReactNode) => void;
  save: (
    obj: object,
    value: ValueType | null,
    moreChanges?: object,
    noClose?: boolean,
  ) => Promise<void>;
  counter: number;
  ClickToEdit: FC<{
    empty?: boolean;
    children?;
  }>;
} {
  const intl = useIntl();
  const context = useContext(EditableContext);
  const [edit, setEdit] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const lastSaveRef = useRef<{
    obj: object;
    value: ValueType | null;
  } | null>(null);

  const save = useMemo(() => {
    // value = undefined/null cause that column to have the value set to NULL in postgres
    return async (
      obj: object,
      value: ValueType | null,
      moreChanges?: object,
      noClose?: boolean,
    ) => {
      lastSaveRef.current = { obj, value };
      try {
        setError("");
        setSaving(true);
        await context.save(obj, { [field]: value ?? null, ...moreChanges });
        if (!noClose) {
          setEdit(false);
        }
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
    setError,
    error: error ? (
      <Alert
        type="error"
        message={
          <>
            {error}{" "}
            <Space>
              <Button
                size="small"
                onClick={() => {
                  lastSaveRef.current = null;
                  setEdit(false);
                  setError("");
                  context.refresh();
                }}
              >
                {intl.formatMessage(labels.cancel)}
              </Button>
              <Button
                type="primary"
                size="small"
                onClick={() => {
                  if (lastSaveRef.current == null) return;
                  // slightly worrisome...
                  save(lastSaveRef.current.obj, lastSaveRef.current.value);
                }}
              >
                Try Again
              </Button>
            </Space>
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
      mouseEnterDelay={1}
    >
      <div
        style={{
          display: "inline-block",
          cursor: "pointer",
          minWidth: "5em",
          minHeight: "1.5em",
          ...(empty
            ? {
                border: "1px solid #ddd",
                borderRadius: "5px",
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

interface ViewOnlyContextType {
  viewOnly: boolean;
}

const ViewOnlyContext = createContext<ViewOnlyContextType>({
  viewOnly: false,
});

export function ViewOnly({ children }) {
  return (
    <ViewOnlyContext.Provider value={{ viewOnly: true }}>
      {children}
    </ViewOnlyContext.Provider>
  );
}

export function useViewOnlyContext(): ViewOnlyContextType {
  return useContext(ViewOnlyContext);
}
