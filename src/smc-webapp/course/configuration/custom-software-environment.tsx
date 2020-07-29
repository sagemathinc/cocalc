import { React, useState } from "../../app-framework";
import { Icon } from "../../r_misc";
import {
  CustomSoftware,
  CustomSoftwareState,
} from "../../custom-software/selector";
import { ConfigurationActions } from "./actions";
import { Button, Card } from "antd";
import { CustomImageDisplay } from "../../project/settings/project-control";

interface Props {
  actions: ConfigurationActions;
  custom_image?: string;
}
export const CustomSoftwareEnvironment: React.FC<Props> = ({
  actions,
  custom_image,
}) => {
  const [changing, set_changing] = useState(false);
  const [state, set_state] = useState<CustomSoftwareState>({});

  function handleChange(state): void {
    set_state(state);
  }
  const current_environment = <CustomImageDisplay image={custom_image} />;

  return (
    <Card
      title={
        <>
          <Icon name="laptop-code" /> Software environment:{" "}
          {current_environment}
        </>
      }
    >
      New student projects will be created using the {current_environment}{" "}
      software environment.
      <br />
      <br />
      <Button onClick={() => set_changing(true)} disabled={changing}>
        Change...
      </Button>
      {changing && (
        <Button
          style={{ margin: "0 5px 0 30px" }}
          onClick={() => set_changing(false)}
        >
          Cancel
        </Button>
      )}
      {changing && (
        <Button
          disabled={
            state.image_type === "custom" && state.image_selected == null
          }
          type="primary"
          onClick={() => {
            set_changing(false);
            actions.set_software_environment(state);
          }}
        >
          Save
        </Button>
      )}
      <br />
      {changing && <CustomSoftware onChange={handleChange} />}
    </Card>
  );
};
