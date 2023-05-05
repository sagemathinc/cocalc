import type { TourProps } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { A } from "@cocalc/frontend/components/A";

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

  if (refs.title.current) {
    v.push({
      title: "Current Directory",
      description: (
        <>
          You can the current working directory here. If it is truncated, mouse
          over it to see the full directory.
        </>
      ),
      target: refs.title.current,
    });
  }

  if (refs.chatgpt.current) {
    v.push({
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
            good knowledge of Linux terminal commands. It can help you learn
            Linux commands, troubleshoot issues, and generally get your homework
            or projects done.
          </p>

          <p>
            ChatGPT will answer questions in an easy-to-understand manner in
            your language, and you can ask followup questions to better
            understand how anything involving the Linux terminal works. Overall,
            ChatGPT is a powerful tool that can be used to enhance your
            understanding of the terminal, making it easier for you to navigate
            and utilize CoCalc effectively.
          </p>
        </>
      ),
      target: refs.chatgpt.current,
    });
  }

  if (refs.zoom.current) {
    v.push({
      title: <>Font Size</>,
      description: (
        <>
          Click these buttons to decrease or increase the size of the font in
          the current terminal. You can also use the keyboard shortcuts
          {"control+<, and control+>"} to adjust the font size.
        </>
      ),
      target: refs.zoom.current,
    });
  }

  return v;
}
