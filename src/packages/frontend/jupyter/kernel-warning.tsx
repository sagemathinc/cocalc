/*
Use the antd alert component to display a warning when it is a nonempty string.
Delay actually showing the warning until at least DELAY seconds after it becomes
nonempty, and don't show it at all if the warning becomes empty again within 3
seconds. Make it possible for the user toϨ clear the warning,:
*/

import { Alert } from "antd";
import { useRedux } from "@cocalc/frontend/app-framework";
import { useState, useEffect } from "react";
import { A } from "@cocalc/frontend/components/A";

interface Props {
  name: string; // redux name
}

const DELAY = 7500;

export default function KernelWarning({ name }: Props) {
  const [warning, setWarning] = useState<string>("");
  const [warnTime, setWarnTime] = useState<number | null>(null);
  const kernelError: undefined | string = useRedux([name, "kernel_error"]);

  useEffect(() => {
    // If the kernel error becomes nonempty, set the warning and warn time
    if (kernelError && !warning) {
      const time = Date.now();
      setWarning(kernelError);
      setWarnTime(time);
      // Clear the warning and warn time if kernel error becomes empty again
    } else if (!kernelError && warning) {
      setWarning("");
      setWarnTime(null);
    }
  }, [kernelError]);

  useEffect(() => {
    // Delay showing the warning until at least 3 seconds after it becomes nonempty
    if (warnTime !== null) {
      const timeDiff = Date.now() - warnTime;
      if (timeDiff < DELAY) {
        const timeoutId = setTimeout(() => {
          setWarnTime(warnTime - 1); // causes re-render but no real change in value.
        }, DELAY - timeDiff);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [warnTime]);

  const clearWarning = () => {
    setWarning("");
    setWarnTime(null);
  };

  return (
    <>
      {warning && warnTime !== null && Date.now() - warnTime >= DELAY && (
        <Alert
          style={{ margin: "5px auto", width: "800px", maxWidth: "100%" }}
          message={
            <div>
              <A
                style={{ float: "right", marginLeft:'10px' }}
                href="https://doc.cocalc.com/howto/jupyter-kernel-terminated.html"
              >
                Docs...
              </A>
              {warning}
            </div>
          }
          type="warning"
          closable
          onClose={clearWarning}
        />
      )}
    </>
  );
}
