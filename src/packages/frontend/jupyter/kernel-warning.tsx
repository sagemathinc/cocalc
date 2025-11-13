/*
Use the antd alert component to display a warning when it is a nonempty string.
*/

import { Alert } from "antd";
import { useRedux } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import type { JupyterActions } from "./browser-actions";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface Props {
  name: string; // redux name
  actions: JupyterActions;
}

export default function KernelWarning({ name, actions }: Props) {
  let kernelError: undefined | string = useRedux([name, "kernel_error"]);
  if (!kernelError) {
    return null;
  }
  const i = kernelError.indexOf("[IPKernelApp]");
  if (i != -1) {
    kernelError = kernelError.slice(0, i);
  }
  return (
    <Alert
      banner
      message={
        <div>
          <A
            style={{ float: "right", marginLeft: "10px" }}
            href="https://doc.cocalc.com/howto/jupyter-kernel-terminated.html"
          >
            Docs...
          </A>
          <StaticMarkdown value={kernelError} />
        </div>
      }
      type="warning"
      closable
      onClose={() => {
        actions.set_kernel_error("");
      }}
    />
  );
}
