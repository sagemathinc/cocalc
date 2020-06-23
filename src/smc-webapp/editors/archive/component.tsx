import { React, useRedux, useActions } from "../../app-framework";
import { Button, Panel } from "../../antd-bootstrap";
import { A, ErrorDisplay, Icon, Loading } from "../../r_misc";

export const Archive: React.FC<{ project_id: string; path: string }> = ({
  path,
  project_id,
}) => {
  const contents: string | undefined = useRedux(["contents"], project_id, path);
  const type: string | undefined = useRedux(["type"], project_id, path);
  const loading: boolean | undefined = useRedux(["loading"], project_id, path);
  const command: string | undefined = useRedux(["command"], project_id, path);
  const error: string | undefined = useRedux(["error"], project_id, path);
  const extract_output: string | undefined = useRedux(
    ["extract_output"],
    project_id,
    path
  );

  const actions = useActions(project_id, path);

  function render_button_icon() {
    if (loading) {
      return <Icon name="cc-icon-cocalc-ring" spin={true} />;
    } else {
      return <Icon name="folder" />;
    }
  }

  function render_unsupported() {
    return (
      <span>
        <b>WARNING:</b> Support for decompressing {type} archives is not yet
        implemented (see{" "}
        <A href="https://github.com/sagemathinc/cocalc/issues/1720">
          https://github.com/sagemathinc/cocalc/issues/1720
        </A>
        ).
        <br />
        Despite that, you can open up a Terminal ("Files" → "Create" dropdown,
        select "Terminal") and run the extraction command right there in the
        Linux shell.
      </span>
    );
  }

  function render_error() {
    if (!error) return;
    const error_component =
      error == "unsupported" ? render_unsupported() : <pre>{error}</pre>;
    return (
      <div>
        <br />
        <ErrorDisplay
          error_component={error_component}
          style={{ maxWidth: "100%" }}
        />
      </div>
    );
  }

  if (contents == null && error == null) {
    return <Loading />;
  }

  return (
    <Panel
      header={
        <span>
          <Icon name="file-zip-o" /> {path}
        </span>
      }
      style={{ overflow: "auto" }}
    >
      <Button
        disabled={!!error || loading}
        bsSize="large"
        bsStyle="success"
        onClick={() =>
          actions.extract_archive_files(project_id, path, type, contents)
        }
      >
        {render_button_icon()} Extract Files...
      </Button>
      <br />
      <br />
      {command && <pre style={{ marginTop: "15px" }}>{command}</pre>}
      {extract_output && (
        <pre style={{ marginTop: "15px" }}>{extract_output}</pre>
      )}
      {render_error()}
      <pre>{contents}</pre>
    </Panel>
  );
};
