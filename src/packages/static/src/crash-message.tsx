import supportURL from "@cocalc/frontend/support/url";
import A from "./link";

export default function CrashMessage({
  msg,
  lineNo,
  columnNo,
  url,
  stack,
  showLoadFail,
}) {
  const getSupport = supportURL({
    subject: showLoadFail
      ? "Crash Report: CoCalc Failed to Load"
      : "CoCalc Crash Report",
    body: `\n\nCONTEXT:\n\n${JSON.stringify(
      { msg, lineNo, columnNo, stack, url },
      undefined,
      2
    )}`,
    type: "question",
    hideExtra: true,
  });

  return (
    <div>
      <div>
        <strong>Application Error:</strong>{" "}
        <code>
          {msg} @ {lineNo}/{columnNo} of {url}
        </code>
      </div>
      <div
        style={{
          border: "1px solid lightgrey",
          margin: "30px 0",
          padding: "15px",
          background: "white",
          borderRadius: "5px",
        }}
      >
        {showLoadFail && <h3>CoCalc Failed to Load</h3>}
        <A href={getSupport}>
          <b>Report the full error.</b>
        </A>{" "}
        In the meantime, try switching to another web browser, upating to the
        latest version of your browser, or{" "}
        <a
          onClick={() => {
            const crash = document.getElementById("cocalc-react-crash");
            if (crash == null) return;
            crash.style.display = "none";
          }}
        >
          dismissing this error
        </a>{" "}
        and continuing.
      </div>
      <pre style={{ overflow: "auto", marginTop: "15px", background: "white" }}>
        {stack}
      </pre>
    </div>
  );
}
