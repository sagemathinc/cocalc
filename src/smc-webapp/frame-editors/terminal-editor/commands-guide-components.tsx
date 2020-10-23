/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// they are used in commands-guide.tsx, that's all

import { CSS, React, useMemo, useState } from "../../app-framework";
import { Button, Row, Col, Select, Typography } from "antd";
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
  args?: (string | undefined)[];
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
): { cmdargs: string; run: boolean } {
  let used_args = args.length == 0; // no args to use
  let cmd = cmd0 ?? "";
  args.forEach((val, idx) => {
    if (val == null) return;
    used_args = true;
    if (cmd.includes(`${idx + 1}`)) {
      // TODO quote "'" inside of file names as "'\''" or something similar?
      cmd = cmd.replace(new RegExp(`\\$${idx + 1}`, "g"), `'${val}'`);
    } else {
      cmd += ` ${val}`;
    }
  });
  return { cmdargs: cmd, run: used_args };
}

export const Command: React.FC<CommandProps> = React.memo(
  (props: CommandProps) => {
    const { cmd, special, title, descr, args, userarg } = props;
    const { cmdargs, run } = useMemo(
      () =>
        special != null
          ? { cmdargs: "", run: false }
          : calc_cmd_args(cmd, args),
      [cmd, args]
    );

    const actions: TerminalActions | undefined = React.useContext(
      TerminalActionsContext
    );

    return (
      <RowLayout
        left={
          <Button
            onClick={() =>
              actions?.run_command(cmdargs, { special, run, userarg })
            }
            shape={"round"}
            size={"small"}
            title={cmdargs}
          >
            <span style={CMD_BTN_STYLE}>{title ?? cmdargs}</span>
          </Button>
        }
        right={<Typography.Text type="secondary">{descr}</Typography.Text>}
      />
    );
  }
);
