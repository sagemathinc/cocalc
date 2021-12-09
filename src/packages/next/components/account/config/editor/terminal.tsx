import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import useEditTable from "lib/hooks/edit-table";

interface Data {
  terminal: {
    font_size: number;
  };
}

const desc = {
  font_size: `New terminals will use this font size by default. You can change this
for a particular terminal at any time.`,
};

register({
  path: "editor/terminal",
  title: "Terminals",
  icon: "terminal",
  desc: "Terminal default font size, color theme, etc.",
  search: desc,
  Component: () => {
    const { edited, setEdited, original, Save, EditNumber } =
      useEditTable<Data>({
        accounts: { terminal: null },
      });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />
        <EditNumber
          path="terminal.font_size"
          title="Terminal Font Size"
          icon="text-height"
          desc={desc.font_size}
          min={5}
          max={32}
          units="px"
          edited={edited}
        />
      </Space>
    );
  },
});
