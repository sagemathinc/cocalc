import { webapp_client } from "../../webapp-client";
import { ErrorDisplay, Loading } from "../../r_misc";
import {
  Component,
  React,
  Rendered,
  useState,
  useAsyncEffect,
} from "../../app-framework";

async function managed_licenses(): Promise<object[]> {
  if (Math.random() < 0.5) {
    throw Error("random error simulations");
  }
  return (
    await webapp_client.async_query({
      query: {
        manager_site_licenses: [{ id: null }],
      } /* todo put in other fields; they are returned anyways */,
    })
  ).query.manager_site_licenses;
}

export function ManagedLicenses2() {
  const [managedLicenses, setManagedLicenses] = useState<any[] | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  useAsyncEffect(
    async (is_mounted) => {
      if (error) return; // do not try when error is set.
      try {
        const v = await managed_licenses();
        if (!is_mounted()) return;
        setManagedLicenses(v);
      } catch (err) {
        if (!is_mounted()) return;
        setError(err.toString());
      }
    },
    [error]
  );

  function render_error() {
    if (!error) return;
    return (
      <ErrorDisplay
        style={{ margin: "5px 0" }}
        error={error}
        onClose={() => setError(undefined)}
      />
    );
  }

  function render_managed() {
    if (managedLicenses == null && !error) {
      return <Loading theme={"medium"} />;
    }
    if (error) return;
    return <pre>{JSON.stringify(managedLicenses, undefined, 2)}</pre>;
  }

  return (
    <div>
      <h3>Licenses that you manage</h3>
      {render_error()}
      {render_managed()}
    </div>
  );
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
