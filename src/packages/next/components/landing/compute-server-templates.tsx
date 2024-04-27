import PublicTemplates from "@cocalc/frontend/compute/public-templates";
import { Button } from "antd";
import { useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import InPlaceSignInOrUp from "components/auth/in-place-sign-in-or-up";
import useProfile from "lib/hooks/profile";
import SelectProject from "components/project/select";
import basePath from "lib/base-path";
import { join } from "path";

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
            console.log("signed up!", profile?.account_id);
            setState("select-project");
          }}
        />
      )}
      {state == "select-project" && (
        <div style={{ maxWidth: "600px", margin: "auto" }}>
          <SelectProject
            onChange={({ project_id }) => {
              console.log("selected", project_id, { basePath });
              window.location.href = join(
                basePath,
                "projects",
                project_id,
                `servers?compute-server-template=${id}`,
              );
            }}
          />
        </div>
      )}
    </div>
  );
}
