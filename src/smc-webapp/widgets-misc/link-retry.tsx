import { Component, Rendered, React } from "../app-framework";

import { Loading, Space, Icon } from "../r_misc";

const { Button } = require("react-bootstrap");

import { retry_until_success } from "smc-util/async-utils";

interface Props {
  href?: string;
  get_href: () => Promise<string>; // optional async function that determines url
  mode: "link" | "button";
}

interface State {
  working: boolean;
  loading: boolean;
  error: boolean;
}

export class LinkRetryUntilSuccess extends Component<Props, State> {
  public displayName: string = "LinkRetryUntilSuccess";
  private is_mounted: boolean = false;
  private url: string = "";

  constructor(props) {
    super(props);
    this.state = {
      working: false,
      loading: false,
      error: false,
    };
    this.click = this.click.bind(this);
  }

  public static defaultProps = {
    mode: "link",
  };

  componentDidMount() {
    this.is_mounted = true;
  }

  componentWillUnmount() {
    this.is_mounted = false;
  }

  open(): void {
    // open_new_tab takes care of blocked popups -- https://github.com/sagemathinc/cocalc/issues/2599
    const { open_new_tab } = require("smc-webapp/misc_page");
    open_new_tab(this.url);
  }

  async start(): Promise<void> {
    this.setState({ loading: true, error: false });
    const f = async (): Promise<void> => {
      let url: string;
      if (this.url) {
        url = this.url;
      } else if (this.props.get_href !== undefined) {
        url = this.url = await this.props.get_href();
      } else if (this.props.href !== undefined) {
        url = this.url = this.props.href;
      } else {
        throw Error("href or get_href must be defined");
      }
      await $.ajax({
        url,
        timeout: 3000,
      });
    };
    try {
      await retry_until_success({
        f,
        max_delay: 1000,
        max_time: 30000,
        desc: "opening link",
      });
    } catch (err) {
      if (!this.is_mounted) {
        return;
      }
      this.setState({ error: true, loading: false, working: false });
      return;
    }
    // Open even if NOT mounted!  E.g., user clicks link then switches tabs.
    this.open();
    if (!this.is_mounted) {
      // not mounted, so don't mess with setState.
      return;
    }
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
    if (this.props.mode === "link" && this.state.loading) {
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

  render_button_info(): Rendered {
    if (this.state.loading) {
      return <Icon name="cc-icon-cocalc-ring" spin />;
    } else if (this.state.error) {
      <span style={{ color: "darkred" }}>(failed to load)</span>;
    } else {
      return undefined;
    }
  }

  render_button(): Rendered {
    return (
      <Button onClick={this.click} bsSize={"small"}>
        {this.props.children} {this.render_button_info()}
      </Button>
    );
  }

  render(): Rendered {
    switch (this.props.mode) {
      case "link":
        return (
          <span>
            {this.render_link()}
            {this.render_loading()}
            {this.render_error()}
          </span>
        );
      case "button":
        return this.render_button();
    }
  }
}

export class ButtonRetryUntilSuccess extends LinkRetryUntilSuccess {
  public static defaultProps = {
    mode: "button",
  };
}
