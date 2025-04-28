/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
a small terminal that lets you enter a single bash command.

IDEAS FOR LATER:

 - [ ] persistent history (in database/project store) -- this is in the log
 - [ ] tab completion
 - [ ] mode to evaluate in another program, e.g., %gp <...>
 - [ ] help

@cspell:ignore miniterminal miniterm

*/
import { Button, Input, Space } from "antd";
import { useIntl } from "react-intl";

import { React, redux, useRef, useState } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { user_activity } from "@cocalc/frontend/tracker";
import { COLORS } from "@cocalc/util/theme";

// used to run the command -- could change to use an action and the store.
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { unreachable } from "@cocalc/util/misc";

export const outputSearchBoxStyle: React.CSSProperties = {
  background: "white",
  position: "absolute",
  zIndex: 2,
  boxShadow: "-4px 4px 7px #aaa",
  maxHeight: "450px",
  overflow: "auto",
  borderRadius: "5px",
} as const;

export const outputMinitermStyle: React.CSSProperties = {
  background: "white",
  position: "absolute",
  zIndex: 2,
  boxShadow: "-4px 4px 7px #aaa",
  maxHeight: "450px",
  overflow: "auto",
  right: 0,
  marginTop: "36px",
  marginRight: "5px",
  borderRadius: "5px",
  width: "100%",
} as const;

const BAD_COMMANDS = {
  sage: "Create a Sage worksheet instead,\nor type 'sage' in a full terminal.",
  ipython:
    "Create a Jupyter notebook instead,\nor type 'ipython' in a full terminal.",
  gp: "Create a Sage worksheet in GP mode\nor type 'gp' in a full terminal.",
  vi: "Type vi in a full terminal instead,\nor just click on the file in the listing.",
  vim: "Type vim in a full terminal instead,\nor just click on the file in the listing.",
  emacs:
    "Type emacs in a full terminal instead,\nor just click on the file in the listing.",
  open: "The open command is not yet supported\nin the miniterminal.  See\nhttps://github.com/sagemathinc/cocalc/issues/230",
} as const;

const EXEC_TIMEOUT = 10; // in seconds

interface Props {
  current_path: string;
  actions: ProjectActions;
  show_close_x?: boolean;
}

const MiniTerminal0: React.FC<Props> = (props: Readonly<Props>) => {
  const { current_path, actions, show_close_x = true } = props;
  const intl = useIntl();
  const { project_id } = useProjectContext();

  //private _id: number = 0;
  const _id = useRef<number>(0);

  const [input, set_input] = useState<string>("");
  const [state, set_state] = useState<"edit" | "run">("edit"); // 'edit' --> 'run' --> 'edit'
  const [stdout, set_stdout] = useState<string | undefined>(undefined);
  const [error, set_error] = useState<string | undefined>(undefined);

  function execute_command() {
    set_stdout("");
    set_error("");
    const input_val = input.trim();
    if (!input_val) {
      return;
    }
    const error = BAD_COMMANDS[input_val.split(" ")[0]];
    if (error) {
      set_state("edit");
      set_error(error);
      return;
    }

    const input0 = input_val + '\necho $HOME "`pwd`"';
    set_state("run");

    _id.current = _id.current + 1;
    const id = _id.current;
    const start_time = new Date().getTime();
    user_activity("mini_terminal", "exec", input);

    const compute_server_id = redux
      .getProjectStore(project_id)
      ?.get("compute_server_id");

    webapp_client.exec({
      project_id,
      command: input0,
      timeout: EXEC_TIMEOUT,
      max_output: 100000,
      bash: true,
      path: current_path,
      err_on_exit: false,
      compute_server_id,
      filesystem: true,
      cb: (err, output) => {
        if (_id.current !== id) {
          // computation was canceled -- ignore result.
          return;
        }
        if (err) {
          set_error(JSON.stringify(err));
          set_state("edit");
        } else if (
          output.exit_code !== 0 &&
          new Date().getTime() - start_time >= 0.98 * EXEC_TIMEOUT
        ) {
          // we get no other error except it takes a long time and the exit_code isn't 0.
          set_state("edit");
          set_error(
            `Miniterminal commands are limited to ${EXEC_TIMEOUT} seconds.\nFor longer or interactive commands,\nuse a full terminal.`,
          );
        } else {
          if (output.stdout) {
            // Find the current path
            // after the command is executed, and strip
            // the output of "pwd" from the output:
            // NOTE: for compute servers which can in theory use a totally different HOME, this won't work.
            // However, by default on cocalc.com they use the same HOME, so it should work.
            // ALSO, note basically this same code is in frontend/project/explorer/search-bar.tsx
            let s = output.stdout.trim();
            let i = s.lastIndexOf("\n");
            if (i === -1) {
              output.stdout = "";
            } else {
              s = s.slice(i + 1);
              output.stdout = output.stdout.slice(0, i);
            }
            i = s.indexOf(" ");
            const full_path = s.slice(i + 1);
            if (full_path.slice(0, i) === s.slice(0, i)) {
              // only change if in project
              const path = s.slice(2 * i + 2);
              actions.open_directory(path);
            }
          }
          if (!output.stderr) {
            // only log commands that worked...
            actions.log({ event: "miniterm", input });
          }
          actions.fetch_directory_listing(); // update directory listing (command may change files)
          set_state("edit");
          set_error(output.stderr);
          set_stdout(
            `${current_path ? "~/" + current_path : "~"}$ ${input}\n${
              output.stdout
            }`,
          );
          if (!output.stderr) {
            set_input("");
          }
        }
      },
    });
  }

  function render_button() {
    switch (state) {
      case "edit":
        return <Button onClick={execute_command} icon={<Icon name="play" />} />;
      case "run":
        return (
          <Button
            onClick={execute_command}
            icon={<Icon name="cocalc-ring" spin />}
          />
        );
      default:
        unreachable(state);
    }
  }

  function render_close_x() {
    if (!show_close_x) return;
    return (
      <Button
        type="text"
        onClick={() => {
          set_stdout("");
          set_error("");
        }}
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          color: COLORS.GRAY_M,
          fontSize: "10pt",
          background: "white",
        }}
      >
        <Icon name="times" />
      </Button>
    );
  }

  function render_output(x, style) {
    if (x) {
      return (
        <pre style={style}>
          {render_close_x()}
          {x}
        </pre>
      );
    }
  }

  function submit(e) {
    e.preventDefault();
    execute_command();
  }

  function keydown(e) {
    // IMPORTANT: if you do window.e and look at e, it's all null!! But it is NOT
    // all null right now -- see
    //     http://stackoverflow.com/questions/22123055/react-keyboard-event-handlers-all-null
    //# e.persist(); window.e = e  # for debugging
    switch (e.key) {
      case "Escape":
        set_stdout("");
        set_error("");
        set_input("");
        break;
      case "Enter":
        submit(e);
        break;
    }
  }

  // We don't use inline, since we still want the full horizontal width.
  return (
    <>
      <Space.Compact style={{ width: "100%" }}>
        <Input
          allowClear
          autoFocus
          type="text"
          value={input}
          placeholder={`${intl.formatMessage(labels.terminal_command)}...`}
          style={{ width: "100%" }}
          addonAfter={render_button()}
          onChange={(e) => {
            e.preventDefault();
            const input_val = e?.target?.value;
            if (!input_val) {
              set_stdout("");
              set_error("");
            }
            if (input_val == null) return;
            set_input(input_val);
          }}
          onKeyDown={keydown}
          onSubmit={submit}
        />
      </Space.Compact>

      <div style={outputMinitermStyle}>
        {render_output(stdout, { margin: 0 })}
        {render_output(error, {
          color: "darkred",
          margin: 0,
        })}
      </div>
    </>
  );
};

export const MiniTerminal: React.FC<Props> = (props) => {
  const { project_id } = useProjectContext();
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  if (student_project_functionality.disableTerminals) {
    return <></>;
  }
  return <MiniTerminal0 {...props} />;
};
