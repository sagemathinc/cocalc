import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import useEditTable from "lib/hooks/edit-table";

interface Data {
  font_size: number;
}

const desc = {
  font_size: `
Newly opened files will open with this font size in pixels by default. You can
change the font size for a particular file (or editor frame) at any time,
and the setting is saved in your browser.
`,
};

register({
  path: "editor/appearance",
  title: "Appearance",
  icon: "font",
  desc: "Editor default font size, color theme, etc.",
  search: desc,
  Component: () => {
    const { edited, setEdited, original, Save, EditNumber } =
      useEditTable<Data>({
        accounts: { font_size: null },
      });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />
        <EditNumber
          path="font_size"
          icon="text-height"
          title="Editor Font Size"
          desc={desc.font_size}
          min={5}
          max={32}
          units="px"
        />
      </Space>
    );
  },
});
