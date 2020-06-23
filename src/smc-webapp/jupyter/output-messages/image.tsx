/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { delay } from "awaiting";
import { React, Component, Rendered } from "smc-webapp/app-framework";
import { get_blob_url } from "../server-urls";

interface ImageProps {
  type: string;
  sha1?: string; // one of sha1 or value must be given
  value?: string;
  project_id?: string;
  width?: number;
  height?: number;
}

interface ImageState {
  attempts: number;
  zoomed: boolean;
}

export class Image extends Component<ImageProps, ImageState> {
  private is_mounted: any;

  constructor(props: ImageProps, context: any) {
    super(props, context);
    this.img_click = this.img_click.bind(this);
    this.state = { attempts: 0, zoomed: false };
  }

  load_error = async (): Promise<void> => {
    if (this.state.attempts < 5 && this.is_mounted) {
      await delay(500);
      if (!this.is_mounted) return;
      this.setState({ attempts: this.state.attempts + 1 });
    }
  };

  componentDidMount(): void {
    this.is_mounted = true;
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
  }

  extension = (): string => {
    return this.props.type.split("/")[1].split("+")[0];
  };

  img_click(): void {
    this.setState((state) => {
      return { zoomed: !state.zoomed };
    });
  }

  render_image(src, on_error?): Rendered {
    const props = {
      src,
      width: this.props.width,
      height: this.props.height,
      onClick: this.img_click,
    };
    if (this.props.width == null && this.props.height == null) {
      const cursor = this.state.zoomed ? "zoom-out" : "zoom-in";
      props["style"] = { cursor } as React.CSSProperties;
      if (!this.state.zoomed) {
        const limit: React.CSSProperties = { maxWidth: "100%", height: "auto" };
        Object.assign(props["style"], limit);
      }
    }
    if (on_error != null) {
      props["onError"] = on_error;
    }
    return <img {...props} />;
  }

  render_using_server(project_id: string, sha1: string): Rendered {
    const blob_url = get_blob_url(project_id, this.extension(), sha1);
    const src = `${blob_url}&attempts=${this.state.attempts}`;
    return this.render_image(src, this.load_error);
  }

  encoding = (): string => {
    switch (this.props.type) {
      case "image/svg+xml":
        return "utf8";
      default:
        return "base64";
    }
  };

  render_locally(value: string): Rendered {
    // The encodeURIComponent is definitely necessary these days.
    // See https://github.com/sagemathinc/cocalc/issues/3197 and the comments at
    // https://css-tricks.com/probably-dont-base64-svg/
    const prefix = `data:${this.props.type};${this.encoding()}`;
    const src = `${prefix},${encodeURIComponent(value)}`;
    return this.render_image(src);
  }

  render(): Rendered {
    if (this.props.value != null) {
      return this.render_locally(this.props.value);
    } else if (this.props.sha1 != null && this.props.project_id != null) {
      return this.render_using_server(this.props.project_id, this.props.sha1);
    } else {
      // not enough info to render
      return <span>[unavailable {this.extension()} image]</span>;
    }
  }
}
