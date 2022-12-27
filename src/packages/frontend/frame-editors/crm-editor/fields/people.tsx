// TODO/NOTE: significant code duplication with accounts.tsx

import { useCallback, useState } from "react";
import { render } from "./register";
import {
  Alert,
  Button,
  Input,
  List,
  Popconfirm,
  Select,
  SelectProps,
  Space,
} from "antd";
import { useEditableContext } from "./context";
import { CloseOutlined } from "@ant-design/icons";
import { Icon } from "@cocalc/frontend/components";
import { usePerson } from "../querydb/use-people";

interface PersonType {
  id: number;
  name?: string;
  email_address?: string;
}

async function peopleSearch({
  query,
  limit,
}: {
  query: string;
  limit: number;
}) {
  console.log("peopleSearch", { query, limit });
  return [
    {
      id: 1,
      name: "Clarita Tish Marie Lefthand Very Long Name Begay Stein",
      email: "a@b.c",
    },
    {
      id: 2,
      name: "William Stein",
      email: "wstein@gmail.com, wstein@cocalc.com",
    },
  ];
}

render({ type: "people" }, ({ field, obj, spec, viewOnly }) => {
  if (spec.type != "people") throw Error("bug");
  const people = obj[field];
  if (people == null && viewOnly) return null;
  if (!viewOnly && spec.editable) {
    return <EditPeople obj={obj} field={field} people={people ?? []} />;
  } else {
    return <PeopleList people={people ?? []} inline />;
  }
});

function Person({ id, inline }: { id: number; inline?: boolean }) {
  const person = usePerson(id);
  return (
    <div
      style={{
        padding: "5px",
        border: "1px solid #ddd",
        ...(inline
          ? {
              textOverflow: "ellipsis",
              width: "200px",
              overflow: "auto",
              whiteSpace: "nowrap",
            }
          : undefined),
      }}
    >
      {person == null ? "..." : `${person.name} -- ${person.email_addresses}`}
    </div>
  );
}

render({ type: "person" }, ({ field, obj }) => {
  const id = obj[field];
  if (id == null) return null;
  return <Person key={id} id={id} />;
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
      {!adding && (
        <Button onClick={() => setAdding(true)}>
          <Icon name="plus-circle" /> Add
        </Button>
      )}
      {adding && (
        <AddPerson key="add-person" people={people ?? []} save={save} />
      )}
      {saveError && <Alert message={saveError} type="error" />}
      <PeopleList people={people ?? []} save={save} />
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
  return (
    <List
      style={inline ? { maxHeight: "6em" } : { maxHeight: "12em" }}
      itemLayout="vertical"
      dataSource={people}
      renderItem={(id: number) => (
        <List.Item>
          <Space>
            <Person key={id} id={id} inline={inline} />
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

function AddPerson({
  people,
  save,
}: {
  people: number[];
  save: (people: number[]) => Promise<void>;
}) {
  const [error, setError] = useState<string>("");
  const [matches, setMatches] = useState<PersonType[] | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  return (
    <div>
      {(matches == null || matches.length == 0) && !error && (
        <Input.Search
          allowClear
          autoFocus
          loading={loading}
          placeholder="Search for people by first name, last name, or email address..."
          enterButton
          onSearch={async (value) => {
            setError("");
            setMatches(null);
            if (!value) {
              return;
            }
            setLoading(true);
            try {
              let matches = await peopleSearch({
                query: value.toLowerCase(), // backend assumes lower case
                limit: 100,
              });
              // exclude any we have already
              if (people.length > 0) {
                const x = new Set(people);
                matches = matches.filter((person) => !x.has(person.id));
              }
              setMatches(matches);
            } catch (err) {
              setError(`${err}`);
            } finally {
              setLoading(false);
            }
          }}
        />
      )}
      {error && <Alert message={error} type="error" />}
      {matches != null && (
        <SelectMatches
          matches={matches}
          addPeople={(newPeople: number[]) => {
            setError("");
            setMatches(null);
            if (newPeople.length > 0) {
              save(people.concat(newPeople));
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
}: {
  matches: PersonType[];
  addPeople: (newPeople: number[]) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  if (matches.length == 0) {
    return <div>No results</div>;
  }

  const options: SelectProps["options"] = [];
  for (const match of matches) {
    options.push({
      label: (
        <span>
          {match.name} ({match.email_address})
        </span>
      ),
      value: match.id,
    });
  }
  return (
    <div>
      <Space style={{ marginBottom: "5px" }}>
        <Button
          disabled={selected.length == 0}
          type="primary"
          onClick={() => {
            addPeople(selected);
          }}
        >
          Add Selected
        </Button>
        <Button
          onClick={() => {
            addPeople([]);
          }}
        >
          Cancel
        </Button>
      </Space>
      <Select
        open
        autoFocus
        mode="multiple"
        allowClear
        style={{ width: "100%" }}
        placeholder="Please select people to associate with this person"
        defaultValue={[]}
        onChange={setSelected}
        options={options}
      />
    </div>
  );
}
