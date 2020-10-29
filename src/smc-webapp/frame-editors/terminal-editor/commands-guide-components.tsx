/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// they are used in commands-guide.tsx, that's all

import { CSS, React, useMemo, useState } from "../../app-framework";
import { Button, Row, Col, Select, Typography, Popconfirm } from "antd";
import { TerminalActions } from "./actions";
import { TerminalActionsContext } from "./commands-guide";

// ------------------------------------

interface SelectFileProps {
  list: string[];
  selected?: string;
  select: (string) => void;
}

export const SelectFile: React.FC<SelectFileProps> = React.memo(
  (props: SelectFileProps) => {
    const { list, selected, select } = props;

    const [search, set_search] = useState<string>("");

    // we do this explicitly, because otherwise it only allows to select known elements
    const input_key_down = (e) => {
      // return key
      if (e.keyCode == 13) {
        select(search);
      }
    };

    return (
      <Select
        value={selected}
        allowClear={true}
        showSearch={true}
        placeholder={"Select or enter name"}
        optionFilterProp={"value"}
        onChange={select}
        onSearch={(val) => set_search(val)}
        onInputKeyDown={input_key_down}
        filterOption={(input, option) =>
          option?.value?.toLowerCase().indexOf(input.toLowerCase()) >= 0
        }
        style={{ width: "100%" }}
      >
        {list.map((val) => (
          <Select.Option key={val} value={val}>
            {val}
          </Select.Option>
        ))}
      </Select>
    );
  }
);

// ------------------------

interface RowLayoutProps {
  left: JSX.Element | string;
  right: JSX.Element | string;
}

const RowLayout: React.FC<RowLayoutProps> = React.memo(
  (props: RowLayoutProps) => {
    return (
      <Row gutter={[16, 8]}>
        <Col flex={"0 1 50%"}>{props.left}</Col>
        <Col flex={"auto"}>{props.right}</Col>
      </Row>
    );
  }
);

interface CommandProps {
  cmd?: string;
  special?: string; // bypass processing the cmd
  title?: string;
  descr: string;
  userarg?: boolean; // if yes, user will have to input an argument in the terminal
  fileargs?: (string | undefined)[];
  dirargs?: (string | undefined)[];
}

const CMD_BTN_STYLE: CSS = {
  whiteSpace: "nowrap",
  fontFamily: "monospace",
  fontSize: "90%",
  textOverflow: "ellipsis",
  overflow: "hidden",
  maxWidth: "100%",
};

// a simple templating approach is used to bolt together the actual command
// either append non-nullish args or insert them everywhere where $1, $2, etc. is
function calc_cmd_args(
  cmd0?: string,
  args: (string | undefined)[] = []
): { cmdargs: string; all_args: boolean } {
  let expected_args = args.length;
  let cmd = cmd0 ?? "";
  args.forEach((val, idx) => {
    if (val == null) return;
    expected_args -= 1;
    if (cmd.includes(`$${idx + 1}`)) {
      // TODO quote "'" inside of file names as "'\''" or something similar?
      cmd = cmd.replace(new RegExp(`\\$${idx + 1}`, "g"), `'${val}'`);
    } else {
      cmd += ` '${val}'`;
    }
  });
  return { cmdargs: cmd, all_args: expected_args <= 0 };
}

export const Command: React.FC<CommandProps> = React.memo(
  (props: CommandProps) => {
    const {
      cmd,
      special,
      title,
      descr,
      userarg = false,
      fileargs = [],
      dirargs = [],
    } = props;
    const args = [...fileargs, ...dirargs];
    const { cmdargs, all_args } = useMemo(
      () =>
        special != null
          ? { cmdargs: "", all_args: false }
          : calc_cmd_args(cmd, args),
      [cmd, fileargs, dirargs]
    );

    const actions: TerminalActions | undefined = React.useContext(
      TerminalActionsContext
    );

    function run_command() {
      actions?.run_command(cmdargs, { special, run: all_args, userarg });
    }

    function render_cmd_btn() {
      return (
        <Button
          shape={"round"}
          size={"small"}
          title={cmdargs}
          onClick={() => all_args && run_command()}
        >
          <span style={CMD_BTN_STYLE}>{title ?? cmdargs}</span>
        </Button>
      );
    }

    function render_cmd() {
      if (!all_args) {
        const msg = `This command expects ${fileargs.length} filename and ${dirargs.length} directoryname arguments, but not all of them are specified. Either select the file and/or directory arguments in the "General" panel above, or insert the command and edit it on the command line.`;
        return (
          <Popconfirm
            title={<div style={{ maxWidth: "300px" }}>{msg}</div>}
            onConfirm={run_command}
            okText="Insert"
            cancelText="Cancel"
          >
            {render_cmd_btn()}
          </Popconfirm>
        );
      } else {
        return render_cmd_btn();
      }
    }

    return (
      <RowLayout
        left={render_cmd()}
        right={<Typography.Text type="secondary">{descr}</Typography.Text>}
      />
    );
  }
);
