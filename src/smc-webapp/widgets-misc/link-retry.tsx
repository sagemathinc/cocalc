import { Component, Rendered, React } from "../app-framework";

const { Loading, Space } = require("../r_misc");

import { retry_until_success } from "../frame-editors/generic/async-utils";

interface Props {
  href: string;
}

interface State {
  working: boolean;
  loading: boolean;
  error: boolean;
}

export class LinkRetryUntilSuccess extends Component<Props, State> {
  public displayName: string = "LinkRetryUntilSuccess";
  private is_mounted: boolean = false;

  constructor(props) {
    super(props);
    this.state = {
      working: false,
      loading: false,
      error: false
    };
    this.click = this.click.bind(this);
  }

  componentDidMount() {
    this.is_mounted = true;
  }

  componentWillUnmount() {
    this.is_mounted = false;
  }

  open(): void {
    // open_new_tab takes care of blocked popups -- https://github.com/sagemathinc/cocalc/issues/2599
    const { open_new_tab } = require("smc-webapp/misc_page");
    open_new_tab(this.props.href);
  }

  async start(): Promise<void> {
    this.setState({ loading: true, error: false });
    async function f(): Promise<void> {
      if (!this.is_mounted) {
        return;
      }
      await $.ajax({
        url: this.props.href,
        timeout: 3000
      });
    }
    try {
      await retry_until_success({
        f,
        max_delay: 1000,
        max_time: 30000
      });
    } catch (err) {
      if (!this.is_mounted) {
        return;
      }
      this.setState({ error: true, loading: false, working: false });
      return;
    }
    if (!this.is_mounted) {
      return;
    }
    this.open();
    this.setState({ error: false, loading: false, working: true });
  }

  click(): void {
    if (this.state.working) {
      this.open();
    } else if (!this.state.loading) {
      this.start();
    }
  }

  render_loading(): Rendered {
    if (this.state.loading) {
      return (
        <span>
          <Space /> <Loading />
        </span>
      );
    }
  }

  render_error(): Rendered {
    if (this.state.error) {
      return (
        <span style={{ color: "darkred" }}>
          <Space /> (failed to load){" "}
        </span>
      );
    }
  }

  render_link(): Rendered {
    return (
      <a onClick={this.click} style={{ cursor: "pointer" }}>
        {this.props.children}
      </a>
    );
  }

  render(): Rendered {
    return (
      <span>
        {this.render_link()}
        {this.render_loading()}
        {this.render_error()}
      </span>
    );
  }
}
