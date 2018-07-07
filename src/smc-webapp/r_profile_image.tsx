import { React, Component } from "./app-framework";
import { Map as ImmutableMap } from "immutable";
import { Button, ButtonToolbar, Well } from "react-bootstrap";
const { Avatar } = require("./other-users");
const { Icon } = require("./r_misc");
// TODO: try this one https://github.com/exelban/react-image-crop-component
const ReactCrop = require("react-image-crop");
import "react-image-crop/dist/ReactCrop.css";
const md5 = require("md5");

interface ProfileImageSelectorProps {
  profile: ImmutableMap<any, any>; // TODO: type
  redux: any; // TODO: type
  account_id: any;
  email_address: string;
}

interface ProfileImageSelectorState {
  is_dragging_image_over_dropzone: boolean;
  custom_image_src?: string;
  crop?: any; // TODO: type
  pixelCrop?: any; // TODO: type
  is_loading?: boolean;
  error?: any;
  show_default_explanation?: boolean;
  show_gravatar_explanation?: boolean;
  show_adorable_explanation?: boolean;
}

export class ProfileImageSelector extends Component<
  ProfileImageSelectorProps,
  ProfileImageSelectorState
> {
  private cancel_loading: (() => void) | undefined;
  constructor(props: ProfileImageSelectorProps, context: any) {
    super(props, context);
    this.state = {
      is_dragging_image_over_dropzone: false
    };
  }

  componentWillUnmount() {
    if (this.cancel_loading != null) {
      this.cancel_loading();
    }
  }

  set_image = (src: string) => {
    this.setState({ is_loading: true });
    const p = makeCancelable(
      new Promise(resolve =>
        this.props.redux
          .getTable("account")
          .set({ profile: { image: src } }, "none", resolve)
      )
    );
    p.promise
      .then((e: any) => {
        this.setState({ error: `${e}`, is_loading: false });
      })
      .catch((e: any) => e != null && !e.isCanceled && console.error(e)); // this is just to suppress the canceled error
    this.cancel_loading = p.cancel;
  };

  handle_gravatar_click = () =>
    this.set_image(
      `https://www.gravatar.com/avatar/${md5(
        this.props.email_address.toLowerCase()
      )}?d=identicon&s=30`
    );

  handle_adorable_click = () =>
    this.set_image(
      `https://api.adorable.io/avatars/100/${md5(
        this.props.email_address.toLowerCase()
      )}.png`
    );

  handle_default_click = () => this.set_image("");

  handle_image_file = (file: File | string) => {
    this.setState({ is_dragging_image_over_dropzone: false });
    if (typeof file == "string") {
      this.setState({ custom_image_src: file });
      return;
    }
    const reader = new FileReader();
    // TODO: type e
    // TODO: cancel on unmount
    reader.onload = (e: any) => {
      this.setState({ custom_image_src: e.target.result });
    };
    reader.readAsDataURL(file);
  };

  // TODO: type e
  handle_image_file_upload = (e: any) => {
    const files = e.target.files;
    let file: File | undefined;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      file = files[0];
    }
    if (file == null) return;
    this.handle_image_file(file);
  };

  // TODO: type e
  handle_image_file_drop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    const items = e.dataTransfer.files;
    for (let item of items) {
      if (item.type.startsWith("image/")) {
        this.handle_image_file(item);
        return;
      }
    }
    const text = e.dataTransfer.getData("text") || "";
    if (text.startsWith("http") || text.startsWith("data:image")) {
      this.handle_image_file(text);
    }
  };

  // TODO: type e
  handle_image_file_paste = (e: any) => {
    e.preventDefault();
    const items = e.clipboardData.items;
    for (let item of items) {
      if (item.type.startsWith("image/")) {
        this.handle_image_file(item.getAsFile());
        return;
      }
    }
    const text = e.clipboardData.getData("text") || "";
    if (text.startsWith("http") || text.startsWith("data:image")) {
      this.handle_image_file(text);
    }
  };

  // TODO: type e
  handle_image_file_input = (e: any) => {
    e.preventDefault();
    const files = e.target.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      this.handle_image_file(files[0]);
    }
  };

  render_options() {
    return (
      <>
        <Button
          style={{ marginTop: "5px" }}
          onClick={this.handle_default_click}
        >
          Default
        </Button>{" "}
        <a
          href="#"
          onClick={e => {
            e.preventDefault();
            this.setState({ show_default_explanation: true });
          }}
        >
          What is this?
        </a>
        {this.state.show_default_explanation ? (
          <Well style={{ marginTop: "10px", marginBottom: "10px" }}>
            The default avatar is a circle with the first letter of your name.
            <br />
            <br />
            <Button
              onClick={() => this.setState({ show_default_explanation: false })}
            >
              Close
            </Button>
          </Well>
        ) : (
          <br />
        )}
        <Button
          style={{ marginTop: "5px" }}
          onClick={this.handle_gravatar_click}
        >
          Gravatar
        </Button>{" "}
        <a
          href="#"
          onClick={e => {
            e.preventDefault();
            this.setState({ show_gravatar_explanation: true });
          }}
        >
          What is this?
        </a>
        {this.state.show_gravatar_explanation ? (
          <Well style={{ marginTop: "10px", marginBottom: "10px" }}>
            Gravatar is a service for using a common avatar across websites. Go
            to the{" "}
            <a href="https://en.gravatar.com" target="_blank">
              Wordpress Gravatar site
            </a>{" "}
            and sign in (or create an account) using {this.props.email_address}.
            <br />
            <br />
            <Button
              onClick={() =>
                this.setState({ show_gravatar_explanation: false })
              }
            >
              Close
            </Button>
          </Well>
        ) : (
          <br />
        )}
        <Button
          style={{ marginTop: "5px" }}
          onClick={this.handle_adorable_click}
        >
          Adorable
        </Button>{" "}
        <a
          href="#"
          onClick={e => {
            e.preventDefault();
            this.setState({ show_adorable_explanation: true });
          }}
        >
          What is this?
        </a>
        {this.state.show_adorable_explanation ? (
          <Well style={{ marginTop: "10px", marginBottom: "10px" }}>
            Adorable creates a cute randomize monster face out of your email.
            See{" "}
            <a href="http://avatars.adorable.io" target="_blank">
              {"http://avatars.adorable.io"}
            </a>{" "}
            for more.
            <br />
            <br />
            <Button
              onClick={() =>
                this.setState({ show_adorable_explanation: false })
              }
            >
              Close
            </Button>
          </Well>
        ) : (
          <br />
        )}
        <Button
          style={{ marginTop: "5px" }}
          onClick={() =>
            document.getElementById("upload-profile-image-input")!.click()
          }
        >
          <input
            id="upload-profile-image-input"
            style={{ display: "none" }}
            type="file"
            onChange={this.handle_image_file_input}
          />
          Upload an image
        </Button>
        <br />
        <div
          className={
            "webapp-image-drop" +
            (this.state.is_dragging_image_over_dropzone
              ? " webapp-image-drop-dragging"
              : "")
          }
          onDrop={this.handle_image_file_drop}
          onPaste={this.handle_image_file_paste}
          onDragEnter={() =>
            this.setState({ is_dragging_image_over_dropzone: true })
          }
          onDragLeave={() =>
            this.setState({ is_dragging_image_over_dropzone: false })
          }
        >
          {this.state.is_dragging_image_over_dropzone
            ? "Drop an image here."
            : "Drag a custom image here."}
        </div>
      </>
    );
  }

  handle_done_cropping = () => {
    const { pixelCrop, custom_image_src: src } = this.state;
    this.setState({ custom_image_src: undefined });
    if (pixelCrop === undefined) {
      this.set_image(src!);
      return;
    }
    const image = new Image();
    image.src = src as string;
    this.set_image(getCroppedImg(image, pixelCrop));
  };

  render_crop_selection() {
    return (
      <>
        <ReactCrop
          src={this.state.custom_image_src}
          minWidth={20}
          minHeight={20}
          onChange={(crop: any, pixelCrop: any) =>
            this.setState({ crop, pixelCrop })
          }
          crop={this.state.crop || { x: 10, y: 10, width: 30, height: 30 }}
        />
        <br />
        <ButtonToolbar>
          <Button
            style={{ marginTop: "5px" }}
            onClick={this.handle_done_cropping}
            bsStyle="success"
          >
            Save
          </Button>
          <Button
            style={{ marginTop: "5px" }}
            onClick={() => this.setState({ custom_image_src: undefined })}
          >
            Cancel
          </Button>
        </ButtonToolbar>
      </>
    );
  }

  render_loading() {
    return (
      <div>
        Saving... <Icon name="spinner" spin={true} />
      </div>
    );
  }

  render() {
    if (this.state.is_loading) {
      return this.render_loading();
    }
    if (this.state.custom_image_src != null) {
      return this.render_crop_selection();
    }
    return (
      <>
        <Avatar
          size={30}
          account_id={this.props.account_id}
          no_tooltip={true}
          no_loading={true}
        />
        <br />
        {this.render_options()}
      </>
    );
  }
}

/**
 * @param {File} image - Image File Object
 * @param {Object} pixelCrop - pixelCrop Object provided by react-image-crop
 */
function getCroppedImg(image, pixelCrop) {
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d")!;

  // TODO: resize to max of 100 by 100 px
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // As Base64 string
  return canvas.toDataURL("image/jpeg");
}

function makeCancelable<T>(promise: Promise<T>) {
  let hasCanceled_ = false;
  const wrappedPromise = new Promise((resolve, reject) => {
    promise.then(
      val =>
        hasCanceled_
          ? reject(
              Object.assign(new Error("is canceled"), { isCanceled: true })
            )
          : resolve(val),
      error =>
        hasCanceled_
          ? reject(
              Object.assign(new Error("is canceled"), { isCanceled: true })
            )
          : reject(error)
    );
  });
  return {
    promise: wrappedPromise,
    cancel() {
      hasCanceled_ = true;
    }
  };
}
