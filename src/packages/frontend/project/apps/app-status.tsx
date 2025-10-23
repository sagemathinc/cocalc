import { capitalize } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

export default function AppStatus({ status }) {
  const { stdout, stderr, state, cmd, args, pid, url, spawnError, exit } =
    status;
  const output =
    stdout != null && stderr != null
      ? Buffer.from(stdout).toString().trim() +
        "\n\n" +
        Buffer.from(stderr).toString().trim()
      : "";
  return (
    <div>
      <h3>{capitalize(state)}</h3>
      {spawnError && (
        <ShowError
          error={
            `Unable to run '${cmd}' -- probably not installed\n\n` +
            "```js\n" +
            JSON.stringify(spawnError, undefined, 2) +
            "\n```"
          }
        />
      )}
      <pre>{JSON.stringify({ pid, url, exit }, undefined, 2)}</pre>
      {cmd && (
        <StaticMarkdown value={"```sh\n" + toShell(cmd, args) + "\n```"} />
      )}
      <pre style={{ maxHeight: "300px" }}>{output}</pre>
    </div>
  );
}

function toShell(cmd, args?: string[]) {
  let s = cmd;
  if (args == null || args.length == 0) {
    return s;
  }
  return s + " " + args.map((x) => (x.includes(" ") ? `"${x}"` : x)).join(" ");
}
