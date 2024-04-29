import PublicTemplates from "@cocalc/frontend/compute/public-templates";
import { Button } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import useProfile from "lib/hooks/profile";
import SelectProject from "components/project/select";
import basePath from "lib/base-path";
import { join } from "path";
import apiPost from "lib/api/post";

type State = "browse" | "sign-in" | "select-project";

export default function ComputeServerTemplates({ style }: { style? }) {
  const [id, setId0] = useState<number | null>(null);
  const setId = (id) => {
    setId0(id);
    setState("browse");
  };
  const [state, setState] = useState<State>("browse");
  const profile = useProfile({ noCache: true });
  //const [account_id, setAccountId] = useState<string | null>(null);
  return (
    <div>
      <PublicTemplates style={style} setId={setId} />
      {id != null && (
        <Button
          disabled={state != "browse"}
          size="large"
          type="primary"
          onClick={() => {
            if (profile?.account_id) {
              setState("select-project");
            } else {
              setState("sign-in");
            }
          }}
        >
          <Icon name="server" /> Build Compute Server...
        </Button>
      )}
      {state == "sign-in" && (
        <InPlaceSignInOrUp
          title="Create Account"
          why="to build your compute server"
          onSuccess={() => {
            setState("select-project");
          }}
        />
      )}
      {state == "select-project" && (
        <div style={{ maxWidth: "600px", margin: "auto" }}>
          <SelectProject
            defaultOpen
            allowCreate
            onChange={async ({ project_id, title }) => {
              if (!project_id) {
                // create the project
                const response = await apiPost("/projects/create", {
                  title,
                });
                project_id = response.project_id;
                if (!project_id) {
                  // didn't work -- TODO: show error
                  return;
                }
              }
              window.location.href = join(
                basePath,
                "projects",
                project_id,
                `servers?compute-server-template=${id}.${project_id}`,
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
