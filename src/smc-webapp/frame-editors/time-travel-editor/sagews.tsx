import { SyncDoc } from "smc-util/sync/editor/generic/sync-doc";
import { Worksheet } from "../../sagews/worksheet";
import { parse_sagews } from "../../sagews/parse-sagews";
import { Rendered, React, Component } from "../../app-framework";

interface Props {
  syncdoc: SyncDoc; // syncdoc corresponding to a Sage worksheet
  version: Date;
}

export class SageWorksheetHistory extends Component<Props> {
  public shouldComponentUpdate(props): boolean {
    return this.props.version != props.version;
  }

  public render(): Rendered {
    const v = this.props.syncdoc.version(this.props.version);
    if (v == null) return <span />;
    const content: string = v.to_str();
    return (
      <div
        className="smc-vfill"
        style={{ overflowY: "scroll", margin: "30px 30px 0 30px" }}
      >
        <Worksheet sagews={parse_sagews(content)} />
      </div>
    );
  }
}
