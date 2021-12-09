import register from "../register";
import { Space } from "antd";
import Loading from "components/share/loading";
import useEditTable from "lib/hooks/edit-table";

const desc = {
  line_wrapping: `Enable line wrapping so that when I line is longer than the width of the editor,
the line will get wrapped so it stays visible, and there is no horizontal scroll bar.  Enabling
this can make it difficult to view the structure of some text involving longer lines, but avoids having
to scroll horizontally.`,
  line_numbers: `Display line numbers to the left of the editor content.`,
  code_folding: `Enable the code folding plugin.  When enabled, you can fold or unfold all
selected code by typing control+Q, or by clicking the triangle to the left of code.`,
};

register({
  path: "editor/options",
  title: "Options",
  icon: "check-square",
  search: desc,
  Component: () => {
    const { edited, setEdited, original, Save, EditBoolean } =
      useEditTable<Data>({
        accounts: { editor_settings: null },
      });

    if (original == null || edited == null) {
      return <Loading />;
    }

    return (
      <Space direction="vertical" style={{ width: "100%" }}>
        <Save />
        <EditBoolean
          icon="align-left"
          path="editor_settings.line_wrapping"
          title="Line Wrapping"
          desc={desc.line_wrapping}
          label="Wrap long lines"
        />
        <EditBoolean
          icon="list-ol"
          path="editor_settings.line_numbers"
          title="Line Numbers"
          desc={desc.line_numbers}
          label="Show line numbers"
        />
        <EditBoolean
          icon="caret-down"
          path="editor_settings.code_folding"
          title="Code Folding"
          desc={desc.code_folding}
          label="Enable code folding plugin"
        />
      </Space>
    );
  },
});
