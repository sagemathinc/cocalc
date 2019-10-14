import { delay } from "awaiting";
import {
  React,
  Component,
  Rendered,
  rclass,
  rtypes
} from "smc-webapp/app-framework";
import { get_blob_url } from "../server-urls";
// https://github.com/souporserious/react-measure
import Measure from "react-measure";
import { Dimensions } from "../store";

interface ImageProps {
  name?: string;
  type: string;
  sha1?: string; // one of sha1 or value must be given
  value?: string;
  project_id?: string;
  width?: number;
  height?: number;
  // redux props
  cell_list_dim?: Dimensions;
}

interface ImageState {
  attempts: number;
  zoomed: boolean;
  style?: React.CSSProperties;
  image_dim?: Dimensions;
}

class ImageComponent extends Component<ImageProps, ImageState> {
  private is_mounted: any;

  constructor(props: ImageProps, context: any) {
    super(props, context);
    this.img_click = this.img_click.bind(this);
    this.state = { attempts: 0, zoomed: false };
  }

  public static reduxProps({ name }) {
    console.log("name", name);
    return {
      [name]: {
        cell_list_dim: rtypes.object
      }
    };
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
    this.setState(state => {
      return { zoomed: !state.zoomed };
    });
  }

  private limit_height(style, height) {
    const max_height = Math.round(height * 0.9);
    const limit: React.CSSProperties = {
      maxHeight: `${max_height}px`,
      width: "auto"
    };
    Object.assign(style, limit);
  }

  //private limit_width(style) {}

  private calc_img_style(image_dim: Dimensions): React.CSSProperties {
    // zoomed actually means we return the image without style extras
    if (this.state.zoomed) return {};

    // if we know it, return the already computed one
    // this avoids endless loops, where a resized image gets a different style, resizing again, etc.
    if (this.state.style != null) return this.state.style;

    const style: React.CSSProperties = {};
    const cursor = this.state.zoomed ? "zoom-out" : "zoom-in";
    const has_size = this.props.width != null && this.props.height != null;
    const area_dim = this.props.cell_list_dim;
    if (image_dim == null || area_dim == null) return style;
    // no data yet
    if (image_dim.width === 0 && image_dim.height === 0) return style;

    if (has_size) {
      console.log("image_dim", image_dim);
      console.log("area_dim", area_dim);

      const portrait = image_dim.width < image_dim.height;
      if (portrait) {
        if (area_dim.height < image_dim.height) {
          this.limit_height(style, area_dim.height);
        }
      } else {
        // landsacpe image
        if (area_dim.width <= image_dim.width) {
          const limit: React.CSSProperties = {
            maxWidth: `${area_dim.width}px`,
            height: "auto"
          };
          Object.assign(style, limit);
        }
      }
    } else {
      // the image has no specific size set
      Object.assign(style, { cursor } as React.CSSProperties);
      if (area_dim.height <= image_dim.height) {
        this.limit_height(style, area_dim.height);
      } else {
        const limit: React.CSSProperties = {
          maxWidth: `100%`,
          height: "auto"
        };
        Object.assign(style, limit);
      }
    }

    this.setState({ style: style });
    return style;
  }

  on_img_resize = (contentRect): void => {
    const image_dim = {
      width: contentRect.client.width,
      height: contentRect.client.height
    };
    const style = this.calc_img_style(image_dim);
    this.setState({ image_dim, style });
  };

  render_image(src, on_error?): Rendered {
    const props = {
      src,
      width: this.props.width,
      height: this.props.height,
      onClick: this.img_click
    };

    if (on_error != null) {
      props["onError"] = on_error;
    }

    return (
      <Measure client onResize={this.on_img_resize}>
        {({ measureRef }) => {
          const style = this.state.style;
          if (style) Object.assign(props, { style });
          return <img ref={measureRef} {...props} />;
        }}
      </Measure>
    );
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

export const Image = rclass(ImageComponent);
