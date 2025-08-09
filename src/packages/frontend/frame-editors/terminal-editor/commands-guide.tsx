/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Collapse,
  Descriptions,
  Divider,
  Switch,
  Table,
  Typography,
} from "antd";
import { Map } from "immutable";
import {
  ControlOutlined,
  FileOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { createContext, useEffect, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { human_readable_size, plural } from "@cocalc/util/misc";
import { TerminalActions } from "./actions";
import { Command, SelectFile } from "./commands-guide-components";
import useFiles from "@cocalc/frontend/project/listing/use-files";
import ShowError from "@cocalc/frontend/components/error";

const { Panel } = Collapse;

interface Props {
  actions: TerminalActions;
  local_view_state: Map<string, any>;
}

export const TerminalActionsContext = createContext<
  TerminalActions | undefined
>(undefined);

const ListingStatsInit = {
  num_files: 0,
  num_dirs: 0,
  size: 0,
};

const info = "info";

function cwd2path(cwd: string): string {
  return cwd.charAt(0) === "/" ? ".smc/root" + cwd : cwd;
}

export function CommandsGuide({ actions, local_view_state }: Props) {
  const [terminal_id, setTerminalId] = useState<string | undefined>();
  const [cwd, set_cwd] = useState<string>(""); // default home directory
  const [hidden, set_hidden] = useState<boolean>(false); // hidden files
  // empty immutable js list
  const [listing_stats, set_listing_stats] =
    useState<typeof ListingStatsInit>(ListingStatsInit);
  const [directoryNames, set_directoryNames] = useState<string[]>([]);
  const [filenames, set_filenames] = useState<string[]>([]);
  // directory and filenames
  const [dir1, set_dir1] = useState<string | undefined>(undefined);
  const [fn1, set_fn1] = useState<string | undefined>(undefined);
  const [fn2, set_fn2] = useState<string | undefined>(undefined);

  useEffect(() => {
    const terminalId =
      actions._get_most_recent_active_frame_id_of_type("terminal");
    if (terminalId == null) {
      return;
    }
    if (terminal_id != terminalId) {
      setTerminalId(terminalId);
    }
  }, [local_view_state]);

  useEffect(() => {
    const next_cwd = local_view_state.getIn([
      "editor_state",
      terminal_id,
      "cwd",
    ]) as string | undefined;
    if (next_cwd != null && cwd != next_cwd) {
      set_cwd(next_cwd);
    }
  }, [terminal_id, local_view_state]);

  const { files, error, refresh } = useFiles({
    fs: actions.fs(),
    path: cwd2path(cwd),
  });

  // finally, if the listing really did change – or show/hide hidden files toggled – recalculate everything
  useEffect(() => {
    if (files == null) {
      return;
    }
    const dirnames: string[] = [".", ".."];
    const filenames: string[] = [];
    for (const name in files) {
      if (!hidden && name.startsWith(".")) {
        continue;
      }
      if (files[name].isDir) {
        dirnames.push(name);
      } else {
        filenames.push(name);
      }
    }
    dirnames.sort();
    filenames.sort();

    set_directoryNames(dirnames);
    set_filenames(filenames);
    const size = filenames
      .map((name) => files[name].size ?? 0)
      .reduce((a, b) => a + b, 0);
    set_listing_stats({
      num_files: filenames.length,
      num_dirs: dirnames.length - 2,
      size,
    });
  }, [files, hidden]);

  // we also clear selected files if they no longer exist
  useEffect(() => {
    if (fn1 != null && !filenames.includes(fn1)) {
      set_fn1(undefined);
    }
    if (fn2 != null && !filenames.includes(fn2)) {
      set_fn2(undefined);
    }
    if (dir1 != null && !directoryNames.includes(dir1)) {
      set_dir1(undefined);
    }
  }, [directoryNames, filenames]);

  function render_files() {
    const dirs = directoryNames.map((v) => ({ key: v, name: v, type: "dir" }));
    const fns = filenames.map((v) => ({ key: v, name: v, type: "file" }));
    const data = [...dirs, ...fns];
    const style = { cursor: "pointer" } as const;
    const columns = [
      {
        title: "Name",
        dataIndex: "name",
        ellipsis: true,
        render: (text, rec) => ({
          props: { style },
          children:
            rec.type == "dir" ? (
              <>
                <FolderOpenOutlined /> {text}
              </>
            ) : (
              <>
                <FileOutlined /> {text}
              </>
            ),
        }),
      },
    ];
    return (
      <>
        <Typography.Text type="secondary">
          Click to insert name into terminal.
        </Typography.Text>
        <Table
          showHeader={false}
          columns={columns}
          dataSource={data}
          size="small"
          onRow={(record) => ({
            onClick: () =>
              actions.run_command(` '${record.name}'`, {
                run: false,
                cleanup: false,
              }),
          })}
        />
      </>
    );
  }

  // these are commands which have at least one file or directory as their argument or operate related to the file system (e.g. cd)
  function render_file_commands() {
    return (
      <>
        <Command cmd="cp -av" descr="copy files" fileargs={[fn1, fn2]} />
        <Command cmd="mv -v" descr="move files" fileargs={[fn1, fn2]} />
        <Command cmd="rm -v" descr="remove a file" fileargs={[fn1]} />
        <Command cmd="stat" descr="file information" fileargs={[fn1]} />
        <Command cmd="file" descr="file type" fileargs={[fn1]} />
        <Command cmd="head" descr="start of text file" fileargs={[fn1]} />
        <Command cmd="tail" descr="end of text file" fileargs={[fn1]} />
        <Command cmd="less" descr="show text file conent" fileargs={[fn1]} />
        <Command
          cmd="diff"
          descr="changes between files"
          fileargs={[fn1, fn2]}
        />
      </>
    );
  }

  function render_directory_commands() {
    return (
      <>
        <Command cmd="ls" descr="list files" />
        <Command cmd="ls -lh" descr="full file listing" />
        <Command cmd="pwd" descr="current directory" />
        <Command cmd="cd" descr="change directory" dirargs={[dir1]} />
        <Command cmd="mkdir" descr="create directory" dirargs={[dir1]} />
        <Command cmd="rmdir" descr="remove empty directory" dirargs={[dir1]} />
        <Command
          cmd="rm -rf"
          descr="remove directory and delete files"
          dirargs={[dir1]}
        />
        <Command cmd="du -sch" descr="disk usage" dirargs={[dir1]} />
      </>
    );
  }

  function render_system_commands() {
    return (
      <>
        <Command cmd="date" descr="current time" />
        <Command cmd="id" descr="user identity" />
        <Command cmd="whoami" descr="who am i?" />
        <Command cmd="df -h" descr="free disk space" />
        <Command cmd="man" descr="manpage [command]" />
        <Command cmd="uname -a" descr="kernel info" />
        <Command cmd="lsb_release -a" descr="LSB info" />

        <Divider orientation="left" plain>
          Processes &amp; Memory
        </Divider>
        <Command cmd="ps auxwf" descr="processes" />
        <Command cmd="free -m" descr="free memory" />
        <Command cmd="top" descr="table of processes" />
        <Command cmd="htop" descr="top for humans" />
      </>
    );
  }

  function render_archiving_commands() {
    return (
      <>
        <Command cmd="tar xf" descr="extract tar archive" fileargs={[fn1]} />
        <Command cmd="gzip -d" descr="gzip decompress" fileargs={[fn1]} />
        <Command cmd="gzip" descr="gzip compress" fileargs={[fn1]} />
      </>
    );
  }

  function render_info() {
    const dir = cwd.startsWith("/") ? cwd : cwd === "" ? "~" : `~/${cwd}`;
    return (
      <Descriptions size="small" bordered column={1}>
        <Descriptions.Item label="Folder">
          <code>{dir}</code>
        </Descriptions.Item>
        <Descriptions.Item label="Content">
          <code>{listing_stats.num_files}</code>{" "}
          {plural(listing_stats.num_files, "file")},{" "}
          <code>{listing_stats.num_dirs}</code>{" "}
          {plural(listing_stats.num_dirs, "directory", "directories")},{" "}
          <code>{human_readable_size(listing_stats.size)}</code>
        </Descriptions.Item>

        <Descriptions.Item label="File 1">
          <SelectFile list={filenames} selected={fn1} select={set_fn1} />
        </Descriptions.Item>
        <Descriptions.Item label="File 2">
          <SelectFile list={filenames} selected={fn2} select={set_fn2} />
        </Descriptions.Item>
        <Descriptions.Item label="Folder">
          <SelectFile list={directoryNames} selected={dir1} select={set_dir1} />
        </Descriptions.Item>

        <Descriptions.Item label="Hidden files">
          <Switch defaultChecked={hidden} onChange={(val) => set_hidden(val)} />
        </Descriptions.Item>
      </Descriptions>
    );
  }

  // commands related to version control with git
  function render_git() {
    return (
      <>
        <Command cmd="git status" descr="current status" />
        <Command cmd="git diff" descr="content changes" />
        <Command cmd="git grep" descr="search file content" userarg={true} />
        <Command cmd="git pull" descr="pull changes" />

        <Divider orientation="left" plain>
          Commit &amp; Push
        </Divider>

        <Command
          cmd="git add"
          descr="add specific file(s)"
          fileargs={[fn1, fn2]}
        />
        <Command cmd="git add -u" descr="add changed files" />
        <Command cmd="git add -A" descr="add all files" />
        <Command cmd="git add -a -- ." descr="add current directory" />
        <Command cmd="git diff --cached" descr="diff staged changed" />
        <Command cmd="git commit -m" descr="commit changes" userarg={true} />
        <Command cmd="git push" descr="push changes" />

        <Divider orientation="left" plain>
          Setup
        </Divider>
        <Command
          cmd="git config --global user.name"
          descr="config user.name"
          userarg={true}
        />
        <Command
          cmd="git config --global user.email"
          descr="config user.email"
          userarg={true}
        />
        <Command cmd="git init" descr="init new repository" />
        <Command cmd="git clone" userarg={true} descr="clone repository" />
      </>
    );
  }

  function render_bash() {
    return (
      <>
        <Command special="up" title={"↑"} descr="Key up: previous command" />
        <Command special="down" title={"↓"} descr="Key down: forward history" />
        <Command special="tab" title={"[Tab]"} descr="Tab key autocompletion" />
        <Command
          special="ctrl-c"
          title={"[Ctrl-c]"}
          descr="Terminate process"
        />
        <Command cmd="FOO=123" descr="set variable" />
        <Command cmd="echo $FOO" descr="echo a variable" />
        <Command cmd="alias" descr="alias" />
        <Command cmd="history" descr="Command history" />
        <Command cmd="reset" descr="Reset terminal" />
        <Command cmd="clear" descr="Clear terminal" />
        <Command cmd="exit 0" descr="Exit current session" />
      </>
    );
  }

  function render_network() {
    return (
      <>
        <Command cmd="ssh" descr="connect via ssh" userarg={true} />
        <Command cmd="wget" descr="download via wget" userarg={true} />
      </>
    );
  }

  function render_help() {
    return (
      <div>
        <p>
          This panel guides you using the terminal. In general, it runs{" "}
          <code>bash</code> interpreter. You usually type in commands and submit
          them for evaluation by pressing the <code>Return</code> key. Try it by
          running in <code>date</code> to see the current time!
        </p>
        <p>
          The "General" panel at the top shows you the current directory and
          statistics about the files. You can also select the first and second
          argument for commands that consume files or a directory name. If there
          is an argument selected, clicking on the command will also evaluate
          it.
        </p>
        <p>
          Open other panels to see some commands you can run. You can also run{" "}
          <code>man [command]</code> to get more information.
        </p>
        <p>
          Open the "Files" panel to see all files in the current directory.
          Click to insert the given filename!
        </p>
      </div>
    );
  }

  function render() {
    const style = { overflowY: "auto" } as const;
    return (
      <Collapse defaultActiveKey={[info]} style={style}>
        <Panel header="General" extra={<InfoCircleOutlined />} key={info}>
          <Typography.Paragraph
            type="secondary"
            ellipsis={{ rows: 1, expandable: true, symbol: "more" }}
          >
            This panel shows you the current directory and statistics about the
            files in it. You can select the first and second argument for
            commands below that consume files or a directory name. If there is
            an argument selected, clicking on the command in a panel below will
            evaluate it. To enter an arbitrary (non-existing) filename, type it
            in an hit the return key.
          </Typography.Paragraph>

          {render_info()}
        </Panel>
        <Panel header="Files" extra={<Icon name="list" />} key="files">
          {render_files()}
        </Panel>
        <Panel
          header="File commands"
          extra={<FileOutlined />}
          key="file-commands"
        >
          {render_file_commands()}
        </Panel>
        <Panel
          header="Folder commands"
          extra={<FolderOpenOutlined />}
          key="directory-commands"
        >
          {render_directory_commands()}
        </Panel>
        <Panel header={"Git"} extra={<Icon name="git" />} key="git">
          {render_git()}
        </Panel>
        <Panel
          header="Archiving"
          extra={<Icon name="file-archive" />}
          key="archiving-commands"
        >
          {render_archiving_commands()}
        </Panel>
        <Panel
          header={"System commands"}
          extra={<ControlOutlined />}
          key="system-commands"
        >
          {render_system_commands()}
        </Panel>
        <Panel header="Bash" extra={<Icon name="terminal" />} key="bash">
          {render_bash()}
        </Panel>
        <Panel
          header={"Network"}
          extra={<Icon name="network-wired" />}
          key="network"
        >
          {render_network()}
        </Panel>
        <Panel header="Help" extra={<QuestionCircleOutlined />} key="help">
          {render_help()}
        </Panel>
      </Collapse>
    );
  }

  return (
    <TerminalActionsContext.Provider value={actions}>
      <ShowError error={error} setError={refresh} />
      {render()}
    </TerminalActionsContext.Provider>
  );
}
