// TODO/NOTE: significant code duplication with accounts.tsx

import { useCallback, useMemo, useState } from "react";
import { render } from "./register";
import { Alert, Button, Input, List, Popconfirm, Select, Space } from "antd";
import { useEditableContext } from "./context";
import { CloseOutlined } from "@ant-design/icons";
import { Icon } from "@cocalc/frontend/components";
import { usePeopleSearch, PersonType } from "../querydb/use-people";
import { Person } from "./person";

render({ type: "people" }, ({ field, obj, spec, viewOnly }) => {
  if (spec.type != "people") throw Error("bug");
  const people = obj[field];
  if (people == null && viewOnly) return null;
  if (!viewOnly && spec.editable) {
    return <EditPeople obj={obj} field={field} people={people} />;
  } else {
    return <PeopleList people={people} inline />;
  }
});

function EditPeople({ obj, field, people }) {
  const { error: saveError, save: save0 } = useEditableContext<number[]>(field);
  const [adding, setAdding] = useState<boolean>(false);
  const save = useCallback(
    async (value: number[]) => {
      try {
        await save0(obj, value);
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
          <Icon name="plus-circle" /> Add
        </Button>
      )}
      {adding && (
        <AddPerson
          multiple
          key="add-person"
          people={people ?? []}
          save={save}
        />
      )}
      {saveError && <Alert message={saveError} type="error" />}
      {people != null && <PeopleList people={people} save={save} />}
    </div>
  );
}

function PeopleList({
  people,
  save,
  inline,
}: {
  people: number[];
  save?: (people: number[]) => Promise<void>;
  inline?: boolean;
}) {
  if (people.length == 0) return null;
  if (inline) {
    return (
      <div>
        {people.map((id) => (
          <Person key={id} id={id} inline />
        ))}
      </div>
    );
  }
  return (
    <List
      style={{ maxHeight: "12em", overflow: "auto" }}
      itemLayout="vertical"
      dataSource={people}
      renderItem={(id: number) => (
        <List.Item>
          <Space>
            <Person key={id} id={id} />
          </Space>
          {save != null && (
            <Popconfirm
              title="Remove this person?"
              onConfirm={() => {
                save(people.filter((x) => x != id));
              }}
            >
              <Button type="link">
                <CloseOutlined />
              </Button>
            </Popconfirm>
          )}
        </List.Item>
      )}
    />
  );
}

export function AddPerson({
  people,
  save,
  multiple,
}: {
  people: number[];
  save: (people: number[] | number) => Promise<void>;
  multiple?: boolean;
}) {
  const [query, setQuery] = useState<string>("");
  const { loading, error, matches } = usePeopleSearch(query);
  const newMatches = useMemo(() => {
    if (matches == null) return null;
    const x = new Set(people);
    return matches.filter((person) => !x.has(person.id));
  }, [matches, people]);

  return (
    <div>
      {error && <Alert message={error} type="error" />}
      {(newMatches == null || newMatches.length == 0) && (
        <Input.Search
          allowClear
          autoFocus
          loading={loading}
          placeholder="Find people in the People table by name or email address..."
          enterButton
          onSearch={setQuery}
        />
      )}
      {newMatches != null && newMatches.length == 0 && (
        <div>No new matching people</div>
      )}
      {newMatches != null && newMatches.length > 0 && (
        <SelectMatches
          multiple={multiple}
          matches={newMatches}
          addPeople={(newPeople: number[] | number | null) => {
            setQuery("");
            if (newPeople == null) return;
            if (typeof newPeople == "number") {
              save(newPeople);
              return;
            }
            if (newPeople.length > 0) {
              save(people.concat(newPeople));
              return;
            }
          }}
        />
      )}
    </div>
  );
}

function SelectMatches({
  matches,
  addPeople,
  multiple,
}: {
  matches: PersonType[];
  addPeople: (newPeople: number[] | number | null) => void;
  multiple?: boolean;
}) {
  const [selected, setSelected] = useState<number[] | number>([]);
  if (matches.length == 0) {
    return <div>No results</div>;
  }

  const options: { label: string; value: number }[] = [];
  for (const match of matches) {
    options.push({
      label: `${match.name}${
        match.email_addresses ? " (" + match.email_addresses + ")" : ""
      }`,
      value: match.id,
    });
  }
  return (
    <Select
      open
      autoFocus
      mode={multiple ? "multiple" : undefined}
      allowClear
      style={{ width: "100%" }}
      placeholder="Select people to associate with this person..."
      defaultValue={multiple ? [] : undefined}
      onChange={setSelected}
      options={options}
      filterOption={(input, option) =>
        (option?.label ?? "").toLowerCase().includes(input.toLowerCase())
      }
      onBlur={() => {
        addPeople(selected);
      }}
    />
  );
}
