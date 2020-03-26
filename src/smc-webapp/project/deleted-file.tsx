import { Card, Button } from "antd";
import { redux, Component, React, Rendered } from "../app-framework";
import { Space } from "../r_misc";
import { path_split } from "smc-util/misc2";

interface Props {
  project_id: string;
  path: string;
  onOpen: Function;
}

export class DeletedFile extends Component<Props> {
  private is_mounted: boolean = true;

  private cancel(): void {
    redux.getProjectActions(this.props.project_id).close_tab(this.props.path);
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
  }

  private async open(): Promise<void> {
    const store = redux.getProjectStore(this.props.project_id);
    const listings = store.get_listings();
    await listings.undelete(this.props.path);
    if (!this.is_mounted) return;
    this.props.onOpen();
  }

  public render(): Rendered {
    const path = path_split(this.props.path).tail;
    return (
      <div className="smc-vfill" style={{ background: "#aaa" }}>
        <Card title={`${path} was deleted`} style={{ margin: "auto" }}>
          Open deleted file {path}?
          <br />
          <br />
          <div style={{ float: "right" }}>
            <Button onClick={() => this.cancel()}>Cancel</Button>
            <Space />
            <Button onClick={() => this.open()} type="primary">
              Open
            </Button>
          </div>
        </Card>
      </div>
    );
  }
}
