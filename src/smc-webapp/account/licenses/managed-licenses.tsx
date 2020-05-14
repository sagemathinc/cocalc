import { webapp_client } from "../../webapp-client";
import { ErrorDisplay, Loading } from "../../r_misc";
import { Component, React, Rendered } from "../../app-framework";

async function managed_licenses(): Promise<object[]> {
  return (
    await webapp_client.async_query({
      query: {
        manager_site_licenses: [{ id: null }],
      } /* todo put in other fields; they are returned anyways */,
    })
  ).query.manager_site_licenses;
}

interface State {
  managed_licenses?: any[];
  error?: string;
}

export class ManagedLicenses extends Component<{}, State> {
  private is_mounted: boolean = false;
  constructor(props, state) {
    super(props, state);
    this.state = {};
  }
  componentWillUnmount() {
    this.is_mounted = false;
  }

  componentWillMount() {
    this.is_mounted = true;
    this.get_managed_licenses();
  }

  async get_managed_licenses(): Promise<void> {
    try {
      const v = await managed_licenses();
      if (!this.is_mounted) return;
      this.setState({ managed_licenses: v });
    } catch (err) {
      if (!this.is_mounted) return;
      this.setState({ error: err.toString() });
    }
  }

  private render_error(): Rendered {
    if (!this.state.error) return;
    return (
      <ErrorDisplay
        style={{ margin: "5px 0" }}
        error={this.state.error}
        onClose={() => this.setState({ error: undefined })}
      />
    );
  }

  private render_managed(): Rendered {
    if (this.state.managed_licenses == null && !this.state.error) {
      return <Loading theme={"medium"} />;
    }
    return (
      <pre>{JSON.stringify(this.state.managed_licenses, undefined, 2)}</pre>
    );
  }

  public render(): JSX.Element {
    return (
      <div>
        <h3>Licenses that you manage</h3>
        {this.render_error()}
        {this.render_managed()}
      </div>
    );
  }
}
