import type { TourProps } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export default function getTour(refs) {
  const v: TourProps["steps"] = [
    {
      title: "Welcome to the CoCalc terminal!",
      description: (
        <div>
          The terminal is a powerful tool for using the Linux operating system.
          In this user tour, we'll highlight key features and commands to help
          you get started. Some key commands are:
          <ol>
            <li>
              <b>
                The <code>ls</code> command
              </b>{" "}
              is used to list files and directories in the current directory.
              Try typing <code>ls /</code> in your terminal right now, and press
              Enter to see a list of files and directories.
            </li>
            <li>
              <b>
                The <code>cd</code> command
              </b>{" "}
              is used to change the current directory.
            </li>
            <li>
              <b>Use tab completion</b> to quickly and easily enter directory
              and file names. Start typing the name of the file or directory and
              then press Tab to autofill the rest.
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

  return v;
}
