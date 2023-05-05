import type { TourProps } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";
import { redux } from "@cocalc/frontend/app-framework";
import { Checkbox } from "antd";

export default function getTour(refs) {
  const v: TourProps["steps"] = [
    {
      title: (
        <div>
          Welcome to the CoCalc terminal!{" "}
          <A href="https://doc.cocalc.com/terminal.html">(docs)</A>
        </div>
      ),
      description: (
        <div>
          The terminal is a powerful tool for using the Linux operating system.
          In this user tour, we'll highlight key features and commands.
          <ol>
            <li>
              <b>
                The <code>ls</code> command
              </b>{" "}
              is used to list files and directories in the current directory.
            </li>
            <li>
              <b>
                The <code>cd</code> command
              </b>{" "}
              is used to change the current directory.
            </li>
            <li>
              <b>Use tab completion</b> to quickly and easily enter directory
              and file names.
            </li>
            <li>There are thousands of other commands!!</li>
          </ol>
        </div>
      ),
    },
  ];

  function step({
    target,
    title,
    description,
    cover,
  }: {
    target?;
    title;
    description;
    cover?;
  }) {
    if (target && !refs[target]?.current) {
      return;
    }
    if (v == null) throw Error("bug");
    v.push({ title, description, cover, target: refs[target]?.current });
  }

  step({
    target: "title",
    title: "Current Directory",
    description: (
      <>
        You can the current working directory here. If it is truncated, mouse
        over it to see the full directory.
      </>
    ),
  });

  step({
    target: "chatgpt",
    title: (
      <>
        <Icon name="robot" /> Ask ChatGPT anything
      </>
    ),
    description: (
      <>
        <p>
          You can ask ChatGPT anything in everyday language and get an answer.
          ChatGPT is trained on a massive amount of data, and has surprisingly
          good knowledge of Linux terminal commands. It can help you learn Linux
          commands, troubleshoot issues, and generally get your homework or
          projects done.
        </p>

        <p>
          ChatGPT will answer questions in an easy-to-understand manner in your
          language, and you can ask followup questions to better understand how
          anything involving the Linux terminal works. Overall, ChatGPT is a
          powerful tool that can be used to enhance your understanding of the
          terminal, making it easier for you to navigate and utilize CoCalc
          effectively.
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
        <Icon name="pause" /> Pause: Don't let your output fly away
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
    title: "Congratulation, you completed the terminal tour!",
    description: (
      <div>
        You can{" "}
        <A href="https://doc.cocalc.com/terminal.html">
          learn more in the docs
        </A>
        .
        <hr />
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
