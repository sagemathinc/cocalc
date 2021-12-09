import register from "../register";
import { Space } from "antd";
import Loading from "components/share/loading";
import useEditTable from "lib/hooks/edit-table";
import A from "components/misc/A";

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
  auto_close_brackets:
    "When you type a bracket character, for example ( or [, CoCalc will automatically insert the corresponding close character.  Some people love how this saves them time, and other people find this extremely annoying; if this annoys you, disable it.",
  match_xml_tags: "Automatically match XML tags",
  auto_close_xml_tags:
    "Automatically close XML tags.  For example, if you are editing HTML and type <a> then </a> is automatically inserted.",
  auto_close_latex:
    "Automatically close LaTeX environments. For example, if you type \\begin{verbatim} and hit enter, then \\end{verbatim} is automatically inserted.",
  strip_trailing_whitespace: `This open makes it so that whenever a file in the editor is saved to disk, whitespace from the ends of lines is removed, since it usually serves no purpose and can get accidentally inserted when editing.  Note that markdown files are always exempt, since trailing whitespace is meaningful for them.`,
  show_trailing_whitespace:
    "Visibly display any trailing whitespace at the ends of lines.  This is useful so that such whitespace isn't invisible.",
  spaces_instead_of_tabs:
    "Send spaces instead of a tab character when the tab key is pressed.  Use this if you prefer, e.g., 4 spaces instead of a tab in your code.  The number of spaces depends on the type of code you are editing.",
  extra_button_bar:
    "Show additional editing functionality  (mainly in Sage worksheets)",
  build_on_save: `Trigger a build of LaTex, Rmd, etc. files whenever they are saved to disk, instead of only building when you click the Build button. This is fine for small documents, but can be annoying for large documents, especially if you are a "compulsive saver".`,
  show_exec_warning:
    "Show a warning if you hit shift+enter (or other keys) when editing certain files, e.g., Python code, that is not directly executable.  This is just to avoid confusion if you create a .py file and think it is a Jupyter notebook.",
};

register({
  path: "editor/options",
  title: "Options",
  icon: "check-square",
  desc: "Configure general behavior of the editors in CoCalc.",
  search: desc,
  Component: () => {
    const { edited, original, Save, EditBoolean } = useEditTable({
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
          desc={desc.line_wrapping}
        />
        <EditBoolean
          icon="list-ol"
          path="editor_settings.line_numbers"
          desc={desc.line_numbers}
        />
        <EditBoolean
          icon="caret-down"
          path="editor_settings.code_folding"
          desc={desc.code_folding}
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.smart_indent"
          desc={desc.smart_indent}
        />
        <EditBoolean
          icon="indent"
          path="editor_settings.electric_chars"
          title={`"Electric" Character Indentation`}
          desc={desc.electric_chars}
        />
        <EditBoolean
          icon="tab"
          path="editor_settings.match_brackets"
          desc={desc.match_brackets}
        />
        <EditBoolean
          icon="code"
          path="editor_settings.auto_close_brackets"
          desc={desc.auto_close_brackets}
        />
        <EditBoolean
          icon="code"
          path="editor_settings.match_xml_tags"
          title="Match XML tags"
          desc={desc.match_xml_tags}
          label="Match XML tags"
        />
        <EditBoolean
          icon="code"
          path="editor_settings.auto_close_xml_tags"
          title="Automatically Close XML Tags"
          desc={desc.auto_close_xml_tags}
          label="Autoclose XML tags"
        />
        <EditBoolean
          icon="tex"
          path="editor_settings.auto_close_latex"
          title="Automatically close LaTeX environments"
          desc={desc.auto_close_latex}
          label="Autoclose LaTeX environments"
        />
        <EditBoolean
          icon="align-left"
          path="editor_settings.strip_trailing_whitespace"
          desc={
            <>
              {desc.strip_trailing_whitespace}{" "}
              <A href="https://www.python.org/dev/peps/pep-0008/#other-recommendations">
                Stripping trailing whitespace is officially recommended for
                Python code.
              </A>
            </>
          }
        />
        <EditBoolean
          icon="align-left"
          path="editor_settings.show_trailing_whitespace"
          desc={desc.show_trailing_whitespace}
        />
        <EditBoolean
          icon="tab"
          path="editor_settings.spaces_instead_of_tabs"
          title="Spaces Instead of Tabs"
          desc={
            <>
              {desc.spaces_instead_of_tabs}{" "}
              <A href="https://www.python.org/dev/peps/pep-0008/#tabs-or-spaces">
                Spaces instead of tabs are officially recommended for Python
                code.
              </A>
            </>
          }
        />
        <EditBoolean
          icon="bars"
          path="editor_settings.extra_button_bar"
          desc={desc.extra_button_bar}
        />
        <EditBoolean
          icon="play-circle"
          path="editor_settings.build_on_save"
          desc={desc.build_on_save}
        />
        <EditBoolean
          icon="step-forward"
          title="Show Execution Warning"
          path="editor_settings.show_exec_warning"
          desc={desc.show_exec_warning}
        />
      </Space>
    );
  },
});
