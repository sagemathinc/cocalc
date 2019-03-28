import { Map } from "immutable";
import { React, Component, Rendered } from "smc-webapp/app-framework";
const { Markdown, HTML } = require("../../r_misc");
import { JupyterActions } from "../browser-actions";
import { Ansi, is_ansi } from "./ansi";
import { Image } from "./image";
import { IFrame } from "./iframe";
import { Javascript } from "./javascript";
import { UntrustedJavascript } from "./untrusted-javascript";
import { PDF } from "./pdf";
import { STDOUT_STYLE } from "./style";
import { TextPlain } from "./text-plain";
import { Widget } from "./widget";

interface DataProps {
  message: Map<string, any>;
  project_id?: string;
  directory?: string;
  id?: string;
  actions?: JupyterActions;
  trust?: boolean;
}

export class Data extends Component<DataProps> {
  shouldComponentUpdate(nextProps): boolean {
    return (
      !this.props.message.equals(nextProps.message) ||
      this.props.id != nextProps.id ||
      this.props.trust != nextProps.trust
    );
  }

  render_html(value: string): Rendered {
    return (
      <div>
        <HTML
          value={value}
          auto_render_math={true}
          project_id={this.props.project_id}
          file_path={this.props.directory}
          safeHTML={!this.props.trust}
        />
      </div>
    );
  }

  render_markdown(value: string): Rendered {
    return (
      <div>
        <Markdown
          value={value}
          project_id={this.props.project_id}
          file_path={this.props.directory}
          safeHTML={!this.props.trust}
          checkboxes={true}
        />
      </div>
    );
  }

  render_data(type: string, value: any): Rendered {
    if (type != "") {
      const [a, b] = type.split("/");
      switch (a) {
        case "text":
          switch (b) {
            case "plain":
              if (is_ansi(value)) {
                return (
                  <div style={STDOUT_STYLE}>
                    <Ansi>{value}</Ansi>
                  </div>
                );
              }
              return <TextPlain value={value} />;

            case "html":
            case "latex": // put latex as HTML, since jupyter requires $'s anyways.
              return this.render_html(value);

            case "markdown":
              return this.render_markdown(value);
          }
          break;

        case "image":
          let height: any;
          let width: any;
          this.props.message
            .get("metadata", [])
            .forEach((value: any, key: any) => {
              if (key === "width") {
                width = value;
              } else if (key === "height") {
                height = value;
              } else {
                // sometimes metadata is e.g., "image/png":{width:, height:}
                if (value && value.forEach) {
                  value.forEach((value: any, key: any) => {
                    if (key === "width") {
                      return (width = value);
                    } else if (key === "height") {
                      return (height = value);
                    }
                  });
                }
              }
            });
          return (
            <Image
              project_id={this.props.project_id}
              type={type}
              sha1={typeof value === "string" ? value : undefined}
              value={typeof value === "object" ? value.get("value") : undefined}
              width={width}
              height={height}
            />
          );

        case "iframe":
          if (value == null || this.props.project_id == null) {
            return <pre>iframe must specify project_id and sha1</pre>;
          } else {
            return <IFrame sha1={value} project_id={this.props.project_id} />;
          }

        case "application":
          switch (b) {
            case "javascript":
              if (this.props.trust) {
                return <Javascript value={value} />;
              }
              return <UntrustedJavascript value={value} />;

            case "pdf":
              if (this.props.project_id == null || value == null) {
                console.warn("PDF: project_id and value must be specified");
                return <pre>Invalid PDF output</pre>;
              }
              return <PDF value={value} project_id={this.props.project_id} />;

            case "vnd.jupyter.widget-view+json":
              return <Widget value={value} actions={this.props.actions} />;
          }
          break;
      }
    }

    return (
      <pre>
        Unsupported message: {type}, {JSON.stringify(value.toJS())}
      </pre>
    );
  }

  render(): Rendered | Rendered[] {
    const data = this.props.message.get("data");
    if (data == null || typeof data.forEach != "function") return;

    const v: Rendered[] = [];
    let n: number = 0;
    data.forEach((value, type) => {
      v.push(<div key={n}>{this.render_data(type, value)}</div>);
      n += 1;
    });
    return v;
  }
}
