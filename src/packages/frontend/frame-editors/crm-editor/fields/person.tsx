import { usePerson } from "../querydb/use-people";
import { render } from "./register";
import { AddPerson } from "./people";
import { Button, Alert } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { useEditableContext } from "./context";
import { useCallback, useState } from "react";

render({ type: "person" }, ({ field, obj, viewOnly, spec }) => {
  if (spec.type != "person") throw Error("bug");
  const id = obj[field];
  if (!viewOnly && spec.editable) {
    return <EditPerson obj={obj} field={field} id={id} />;
  } else {
    return id == null ? null : <Person key={id} id={id} inline />;
  }
});

function EditPerson({ obj, field, id }) {
  const { error: saveError, save: save0 } = useEditableContext<number>(field);
  const [adding, setAdding] = useState<boolean>(false);
  const save = useCallback(
    async (id: number) => {
      try {
        await save0(obj, id);
        setAdding(false);
      } catch (_) {}
    },
    [save0, obj]
  );

  return (
    <div>
      {adding && (
        <Button
          onClick={() => setAdding(false)}
          style={{ marginBottom: "5px" }}
        >
          Done
        </Button>
      )}
      {!adding && (
        <Button onClick={() => setAdding(true)}>
          <Icon name="plus-circle" /> Search...
        </Button>
      )}
      {adding && (
        <AddPerson
          key="add-person"
          people={id != null ? [id] : []}
          save={save}
        />
      )}
      {saveError && <Alert message={saveError} type="error" />}
      {id != null && <Person id={id} />}
    </div>
  );
}

export function Person({ id, inline }: { id: number; inline?: boolean }) {
  const person = usePerson(id);
  return (
    <div
      style={
        inline
          ? {
              textOverflow: "ellipsis",
              width: "200px",
              overflow: "auto",
              whiteSpace: "nowrap",
              display: "inline-block",
            }
          : { padding: "5px", border: "1px solid #ddd" }
      }
    >
      {person == null ? "..." : `${person.name} -- ${person.email_addresses}`}
    </div>
  );
}
