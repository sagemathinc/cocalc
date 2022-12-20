import { render } from "./register";
import { Icon, IconName } from "@cocalc/frontend/components";
import { useEffect, useState } from "react";
import { useEditableContext } from "./context";
import IconSelect from "@cocalc/frontend/components/icon-select";

render({ type: "icon", editable: false }, ({ field, obj }) => {
  const name = obj[field];
  return name ? <Icon name={name} /> : null;
});

render({ type: "icon", editable: true }, ({ field, obj, spec }) => {
  if (spec.type != "icon" || !spec.editable) {
    throw Error("bug");
  }
  const [name, setName] = useState<string>(obj[field]);
  const { edit, save, saving, counter, error, ClickToEdit } =
    useEditableContext<string>(field);

  useEffect(() => {
    setName(obj[field]);
  }, [counter]);

  if (edit) {
    return (
      <div>
        <IconSelect
          disabled={saving}
          onSelect={(name) => {
            setName(name);
            save(obj, name);
          }}
          fontSize="10px"
          style={{
            fontSize: "16pt",
            maxWidth: "100%",
            maxHeight: "200px",
            overflowY: "scroll",
          }}
        />
        {error}
      </div>
    );
  } else {
    return (
      <ClickToEdit empty={!name?.trim()}>
        {name ? (
          <Icon style={{ fontSize: "24pt" }} name={name as IconName} />
        ) : (
          ""
        )}
      </ClickToEdit>
    );
  }
});
