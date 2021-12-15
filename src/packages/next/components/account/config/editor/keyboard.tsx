import register from "../register";
import { Table, Space } from "antd";
import Loading from "components/share/loading";
import useEditTable from "lib/hooks/edit-table";
import { EDITOR_BINDINGS } from "@cocalc/util/db-schema/accounts";
import keyboardShortcuts, {
  desc as shortcutsDesc,
} from "@cocalc/frontend/account/keyboard-shortcuts";
import { IS_MACOS } from "@cocalc/frontend/feature";

interface Data {
  editor_settings: {
    bindings: keyof typeof EDITOR_BINDINGS;
    evaluate_key: "Shift-Enter" | "Enter";
  };
}

const desc = {
  bindings: `Keyboard bindings: standard, sublime, vim and emacs.`,
  shortcuts: shortcutsDesc,
  evaluate_key:
    "You can use either Shift-Enter or plain Enter to evaluate code in Sage worksheets. If you use Enter for evaluation, use Shift-Enter to enter a new line.  This setting does not impact Jupyter notebooks.",
};

register({
  path: "editor/keyboard",
  title: "Keyboard",
  icon: "keyboard",
  desc: "Configure keyboard bindings.",
  search: desc,
  Component: () => {
    const { edited, original, Save, EditSelect, Heading } = useEditTable<Data>({
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
        <br />
        <Heading title="Editor Keyboard Shortcuts" desc={desc.shortcuts} />
        <KeyboardShortcuts />
        <EditSelect
          title="Sage Worksheet Evaluate Key"
          path="evaluate_key"
          desc={desc.evaluate_key}
          options={["Shift-Enter", "Enter"]}
        />
      </Space>
    );
  },
});

interface KbdData {
  command: string;
  shortcut: string;
}

const columns = [
  {
    title: "Command",
    dataIndex: "command",
    key: "command",
    width: "50%",
    filterSearch: true,
    onFilter: (value, record) => record.name.includes(value),
  },
  {
    title: "Shortcut",
    dataIndex: "shortcut",
    key: "shortcut",
  },
];

function KeyboardShortcuts() {
  const shortcuts = keyboardShortcuts(IS_MACOS);
  const data: KbdData[] = [];
  for (const command in shortcuts) {
    const shortcut = shortcuts[command];
    data.push({ command, shortcut });
  }
  return <Table columns={columns} dataSource={data} pagination={false} />;
}
