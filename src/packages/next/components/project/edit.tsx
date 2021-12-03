/*
Edit some very basic configuration of a project, mainly that is relevant for sharing for now,
but maybe later everything.
*/

import { useState } from "react";
import { useRouter } from "next/router";
import { Button, Input, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import EditRow from "components/misc/edit-row";
import SaveButton from "components/misc/save-button";

interface Props {
  title: string;
  description: string;
  name: string;
  project_id: string;
}

export default function Edit(props: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<boolean>(!!router.query.edit);

  return (
    <div style={{ marginBottom: "15px" }}>
      <Button
        disabled={expanded}
        onClick={(e) => {
          e.preventDefault();
          setExpanded(true);
        }}
        key="edit"
        size="small"
      >
        <Icon name="pencil" /> Edit...
      </Button>
      {expanded && (
        <EditFields
          original={props}
          onClose={() => {
            setExpanded(false);
            // This reloads the page, but with no flicker, so user sees new information reflected.
            router.push({ pathname: router.asPath.split("?")[0] });
          }}
        />
      )}
    </div>
  );
}

interface Info {
  project_id: string;
  name: string;
  title: string;
  description: string;
}

function EditFields({
  original,
  onClose,
}: {
  original: Info;
  onClose: () => void;
}) {
  const [edited, setEdited] = useState<Info>(original);
  return (
    <div
      style={{
        width: "100%",
        border: "1px solid #eee",
        padding: "15px",
        marginTop: "15px",
      }}
    >
      <div>
        <Space style={{ float: "right" }}>
          <SaveButton edited={edited} defaultOriginal={original} table="projects" />
          <Button style={{ float: "right" }} onClick={onClose}>
            Close
          </Button>
        </Space>
      </div>
      <br />
      <EditRow label="Title">
        <Input
          value={edited.title}
          onChange={(e) => setEdited({ ...edited, title: e.target.value })}
        />
      </EditRow>
      <EditRow label="Description">
        <Input.TextArea
          value={edited.description}
          onChange={(e) =>
            setEdited({ ...edited, description: e.target.value })
          }
          autoSize={{ minRows: 2 }}
        />
      </EditRow>
      <EditRow label="Name (for nicer URLs)">
        <Input
          value={edited.name}
          onChange={(e) => setEdited({ ...edited, name: e.target.value })}
        />
      </EditRow>
    </div>
  );
}
