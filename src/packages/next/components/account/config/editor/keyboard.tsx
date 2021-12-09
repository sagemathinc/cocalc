import register from "../register";
import { Space } from "antd";
import Loading from "components/share/loading";
import useEditTable from "lib/hooks/edit-table";
import { EDITOR_BINDINGS } from "@cocalc/util/db-schema/accounts";

interface Data {
  editor_settings: {
    bindings: keyof EDITOR_BINDINGS;
  };
}

const desc = {
  bindings: `Keyboard bindings...`,
};

register({
  path: "editor/keyboard",
  title: "Keyboard",
  icon: "keyboard",
  desc: "Configure keyboard bindings.",
  search: desc,
  Component: () => {
    const { edited, original, Save, EditSelect } = useEditTable<Data>({
      accounts: { editor_settings: null },
    });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />
        <EditSelect
          path="editor_settings.bindings"
          icon="keyboard"
          desc={desc.bindings}
          options={EDITOR_BINDINGS}
        />
      </Space>
    );
  },
});
