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
  smart_indent: `When you are editing code, smart indent automatically indents new lines based
on the editor's understanding of your code.`,
  electric_chars: `When electric characters is enabled, typing certain characters, such
as { and } in C-like languages, cause the current line to be reindented.`,
  match_brackets: "Highlight matching brackets near cursor",
  auto_close_brackets: "Automatically close brackets",
  match_xml_tags: "Automatically match XML tags",
  auto_close_xml_tags: "Automatically close XML tags.  For example, if you are editing HTML and type <a> then </a> is automatically inserted.",
  auto_close_latex: "Automatically close LaTeX environments. For example, if you type \\begin{verbatim} and hit enter, then \\end{verbatim} is automatically inserted.",
  strip_trailing_whitespace: "remove whenever file is saved",
  show_trailing_whitespace: "show spaces at ends of lines",
  spaces_instead_of_tabs: "send spaces when the tab key is pressed",
  extra_button_bar: "more editing functions (mainly in Sage worksheets)",
  build_on_save: "build LaTex/Rmd files whenever they are saved to disk",
  show_exec_warning: "warn that certain files are not directly executable",
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
          title="Line Numbers when editing code files"
          desc={desc.line_numbers}
          label="Line numbers"
        />
        <EditBoolean
          icon="caret-down"
          path="editor_settings.code_folding"
          title="Code Folding"
          desc={desc.code_folding}
          label="Code folding"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.smart_indent"
          title="Smart Indentation"
          desc={desc.smart_indent}
          label="Smart code indentation"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.electric_chars"
          title="Electric Character Indentation"
          desc={desc.electric_chars}
          label="Electric character indentation"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.match_brackets"
          title="Match Brackets"
          desc={desc.match_brackets}
          label="Match brackets"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.auto_close_brackets"
          title="Automatically Close Brackets"
          desc={desc.auto_close_brackets}
          label="Automatically close brackets"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.match_xml_tags"
          title="Match XML tags"
          desc={desc.match_xml_tags}
          label="Match XML tags"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.auto_close_xml_tags"
          title="Automatically Close XML Tags"
          desc={desc.auto_close_xml_tags}
          label="Autoclose XML tags"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.auto_close_latex"
          title="Automatically close LaTeX environments"
          desc={desc.auto_close_latex}
          label="Autoclose LaTeX"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.strip_trailing_whitespace"
          title="Electric Character Indentation"
          desc={desc.strip_trailing_whitespace}
          label="Electric character indentation"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.show_trailing_whitespace"
          title="Electric Character Indentation"
          desc={desc.show_trailing_whitespace}
          label="Electric character indentation"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.spaces_instead_of_tabs"
          title="Electric Character Indentation"
          desc={desc.spaces_instead_of_tabs}
          label="Electric character indentation"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.extra_button_bar"
          title="Electric Character Indentation"
          desc={desc.extra_button_bar}
          label="Electric character indentation"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.build_on_save"
          title="Electric Character Indentation"
          desc={desc.build_on_save}
          label="Electric character indentation"
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.show_exec_warning"
          title="Electric Character Indentation"
          desc={desc.show_exec_warning}
          label="Electric character indentation"
        />
      </Space>
    );
  },
});
