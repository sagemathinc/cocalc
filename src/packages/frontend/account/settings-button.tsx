/*
Button to get to the settings page. Currently used by lite mode only.
*/

import { Icon } from "@cocalc/frontend/components";
import { Button } from "antd";
import { redux } from "@cocalc/frontend/app-framework";

export default function SettingsButton() {
  const icon = <Icon name="cog" />;
  return (
    <Button
      style={{ margin: "2.5px 0 0 10px" }}
      type="text"
      onClick={() => {
        redux.getActions("page").set_active_tab("account");
      }}
    >
      {icon}
    </Button>
  );
}
