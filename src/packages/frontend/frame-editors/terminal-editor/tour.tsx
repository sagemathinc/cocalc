import type { TourProps } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";
import { redux } from "@cocalc/frontend/app-framework";
import { Checkbox } from "antd";
import terminalImage from "./terminal.png";
import splitImage from "./split-terminals.png";

// The any for the images is because nextjs also ingests this for some reason and
// it has contradictory typescript defs for png.

export default function getTour(refs) {
  const v: TourProps["steps"] = [];

  function step({
    target,
    title,
    description,
    cover,
  }: {
    target?;
    title;
    description?;
    cover?;
  }) {
    if (target && !refs[target]?.current) {
      return;
    }
    if (v == null) throw Error("bug");
    v.push({
      title,
      description,
      cover: cover != null ? <img src={cover as any} /> : undefined,
      target: refs[target]?.current,
    });
  }

  step({
    target: "tour",
    cover: terminalImage,
    title: (
      <div>
        Welcome to the CoCalc Terminal Tour!{" "}
        <A href="https://doc.cocalc.com/terminal.html">(docs)</A>
      </div>
    ),
    description: (
      <div>
        The terminal is a powerful tool for using the Linux operating system. In
        this user tour, we'll highlight key features and commands.
        <ol>
          <li>
            <b>
              The <code>ls</code> command
            </b>{" "}
            is used to list files and directories in the current directory,
            <code>cd path</code> to change directories.
          </li>
          <li>
            <b>
              The <code>open</code> command
            </b>{" "}
            lets you create or open a file from the terminal. Try typing this:{" "}
            <code>open a.c</code>
          </li>
          <li>
            <b>Use tab completion</b> to quickly and easily enter directory and
            file names. Try typing <code>l[tab][tab]</code> right now.
          </li>
          <li>There are thousands of other commands!!</li>
        </ol>
      </div>
    ),
  });

  step({
    target: "all-buttons",
    title: "Hidden Buttons",
    description:
      "If your terminal is skinny some of the buttons may not be visible.  See all buttons by clicking these ellipsis.",
  });

  step({
    target: "title",
    title: "Current Folder",
    description: (
      <>
        The name of the current working folder is displayed here. If it is
        truncated, mouse over it to see the full folder name.
      </>
    ),
  });

  step({
    target: "chatgpt",
    title: (
      <>
        <Icon name="robot" /> Ask Artificial Intelligence
      </>
    ),
    description: (
      <>
        <p>
          Ask Artificial Intelligence (AI) anything in everyday language about
          the terminal. AI is trained on a massive amount of data, and has
          amazingly good knowledge of Linux terminal commands. It can help you
          learn Linux, troubleshoot issues, find all files with some property,
          and generally get your homework or projects done.
        </p>
        <p>
          For instance, you might ask about how to manipulate a large data file
          or automate a repetitive task.
        </p>
      </>
    ),
  });

  step({
    target: "zoom",
    title: <>Font Size</>,
    description: (
      <>
        Click these buttons to decrease or increase the size of the font in the
        current terminal. You can also use the keyboard shortcuts
        {"control+<, and control+>"} to adjust the font size.
      </>
    ),
  });

  step({
    target: "pause",
    title: (
      <>
        <Icon name="pause" /> Pause: Don't let your output fly by
      </>
    ),
    description: (
      <>
        If output is scrolling by on your terminal, click pause to temporarily
        stop it, so you can read output or copy some text.
      </>
    ),
  });

  step({
    target: "copy",
    title: <>Copy and Paste</>,
    description: (
      <>
        <p>
          Copy your results to or from your terminal to another file using copy
          and paste. For security reasons, these two buttons use an internal
          CoCalc buffer that is separate from the operating system copy/paste
          buffer.
        </p>
        <p>Select some text in your terminal now, copy it, then paste it.</p>
        <p>
          The usual control+c (or command+c) keyboard shortcuts access the
          operating system copy/paste buffers. Note that control+c with text
          selected is copy, whereas control+c with nothing selected interrupts
          what is running.
        </p>
      </>
    ),
  });

  step({
    title: (
      <>
        <Icon name={"rocket"} /> Initialization Script
      </>
    ),
    description: (
      <>
        <p>
          Run a script every time this terminal starts. You can set environment
          variables, connect to a remote host, start python running, or anything
          else.
        </p>

        <p>
          If you hit control+d or click the skull, the terminal will quit, then
          start again. Also if you restart your project or leave your project
          until it stops, when you open this ".term" file, then the terminal
          will start.
        </p>
      </>
    ),
    target: "edit_init_script",
  });

  step({
    title: (
      <>
        <Icon unicode={0x2620} /> Kill and Restart Terminal
      </>
    ),
    description: (
      <>
        If things gets all messed up or stuck for some reason, you can reset
        everything in this terminal. This terminates running programs, respawns
        the shell, and cleans up the display.
      </>
    ),
    target: "clear",
  });

  step({
    target: "kick_other_users_out",
    title: (
      <>
        <Icon name={"skull-crossbones"} /> Force Resize
      </>
    ),
    description: (
      <>
        Multiple people can open a terminal at once. The terminal size is the
        minimum of the sizes of everybody using the terminal. This can be
        annoying if somebody leaves a terminal open (e.g., you in another
        browser), so you can boot everybody else.
      </>
    ),
  });

  step({
    target: "guide",
    title: (
      <>
        <Icon name="magic" /> Open the Guide
      </>
    ),
    description: (
      <>
        The terminal guide is a tool for creating, testing, and learning about
        terminal commands.
      </>
    ),
  });

  step({
    target: "help",
    title: <>Documentation</>,
    description: (
      <>
        You can learn much more about using the terminal in CoCalc{" "}
        <A href="https://doc.cocalc.com/terminal.html">in our documentation.</A>
      </>
    ),
  });

  step({
    target: "control",
    title: "Frame Control",
    cover: splitImage,
    description:
      "Use these buttons to split the terminal horizontally or vertically to create multiple distinct side-by-side terminals.  You can  maximize one terminal to focus on a task, and you can independently adjust the font size in each terminal.",
  });

  step({
    title: "Congratulation, you completed the terminal tour!",
    description: (
      <div>
        <Checkbox
          onChange={(e) => {
            const actions = redux.getActions("account");
            if (e.target.checked) {
              actions.setTourDone("frame-terminal");
            } else {
              actions.setTourNotDone("frame-terminal");
            }
          }}
        >
          Hide tour (you can unhide this in Account Prefs)
        </Checkbox>
      </div>
    ),
  });

  return v;
}
