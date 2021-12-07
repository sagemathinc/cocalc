import { Space } from "antd";
import Loading from "components/share/loading";
import register from "../register";
import IntegerSlider from "components/misc/integer-slider";
import useEditTable from "lib/hooks/edit-table";

interface Data {
  font_size: number;
}

const descFontSize = `
Newly opened files will open with this font size by default. You can
change the font size for a particular file (or even frame) at any time,
and the setting is saved in your browser.
`;

register({
  path: "editor/appearance",
  title: "Appearance",
  icon: "font",
  desc: "Editor default font size, color theme, etc.",
  search: descFontSize,
  Component: () => {
    const { edited, setEdited, original, Save } = useEditTable<Data>({
      accounts: { font_size: null },
    });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        {Save}
        <h2>Font Size</h2>
        <b>Editor font size:</b>
        {descFontSize}
        <IntegerSlider
          value={edited.font_size}
          onChange={(font_size) => {
            edited.font_size = font_size;
            setEdited(edited);
          }}
          min={5}
          max={32}
        />
      </Space>
    );
  },
});
