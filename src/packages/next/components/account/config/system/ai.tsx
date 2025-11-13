import { Space } from "antd";

import Loading from "components/share/loading";
import useEditTable from "lib/hooks/edit-table";
import register from "../register";

const desc = {
  time_ago_absolute: `
You can display timestamps either as absolute points in time or relative to
the current time.`,
  dark_mode: `Use Dark mode to reduce eye strain and save power by showing light text on a dark background.`,
  extra: "dark reader",
};

interface Data {
  other_settings: {
    openai_disabled: boolean;
  };
}

register({
  path: "system/llm",
  title: "AI Settings",
  icon: "ai",
  desc: "Configure AI integrations.",
  search: desc,
  Component: () => {
    const { edited, original, Save, EditBoolean } = useEditTable<Data>({
      accounts: { other_settings: null },
    });
    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />

        <EditBoolean
          path="other_settings.openai_disabled"
          icon="robot"
          title="Disable all AI integrations"
          desc={
            <>
              Disable code generation, buttons in Jupyter, @chatgpt mentions,
              etc.
            </>
          }
          label="Disable all AI integrations"
        />

        {/* TODO: insert the <ModelSwitch/> component here, which is more complex than just a plain list of options */}
      </Space>
    );
  },
});
