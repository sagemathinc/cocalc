import { React, Component, Rendered } from "./app-framework";
import { Map as ImmutableMap } from "immutable";
import { Button, ButtonToolbar, FormControl, Well } from "react-bootstrap";
const { Avatar } = require("./other-users");
import { ErrorDisplay, Icon, ProfileIcon } from "./r_misc";
const md5 = require("md5");

import * as ReactCrop from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

const ReactCropComponent = (ReactCrop as any).Component;

// This is what facebook uses, and it makes
// 40x40 look very good.  It takes about 20KB
// per image.
const AVATAR_SIZE: number = 160;

interface ProfileImageSelectorProps {
  profile: ImmutableMap<any, any>;
  redux: any;
  account_id: any;
  email_address: string | undefined;
}

interface ProfileImageSelectorState {
  is_dragging_image_over_dropzone: boolean;
  custom_image_src?: string;
  crop?: ReactCrop.Crop;
  is_loading?: boolean;
  error?: any;
  show_default_explanation?: boolean;
  show_gravatar_explanation?: boolean;
  show_adorable_explanation?: boolean;
  croppedImageUrl?: string;
}

export class ProfileImageSelector extends Component<
  ProfileImageSelectorProps,
  ProfileImageSelectorState
> {
  private is_mounted: boolean = true;
  private imageRef: any;

  constructor(props: ProfileImageSelectorProps, context: any) {
    super(props, context);
    this.state = {
      is_dragging_image_over_dropzone: false,
      crop: {
        unit: "%",
        width: 100,
        aspect: 1,
      },
    };
  }

  componentWillUnmount() {
    this.is_mounted = false;
  }

  set_image = async (src: string) => {
    this.setState({ is_loading: true });
    const table = this.props.redux.getTable("account");
    try {
      await table.set({ profile: { image: src } }, "none");
    } catch (err) {
      if (this.is_mounted) {
        this.setState({ error: `${err}` });
      }
    } finally {
      if (this.is_mounted) {
        this.setState({ is_loading: false });
      }
    }
  };

  handle_gravatar_click = () => {
    if (!this.props.email_address) {
      // Should not be necessary, but to make typescript happy.
      return;
    }
    this.set_image(
      `https://www.gravatar.com/avatar/${md5(
        this.props.email_address.toLowerCase()
      )}?d=identicon&s=30`
    );
  };

  handle_adorable_click = () => {
    if (!this.props.email_address) {
      // Should not be necessary, but to make typescript happy.
      return;
    }
    this.set_image(
      `https://api.adorable.io/avatars/100/${md5(
        this.props.email_address.toLowerCase()
      )}.png`
    );
  };

  handle_default_click = () => this.set_image("");

  handle_image_file = (file: File | string) => {
    this.setState({ is_dragging_image_over_dropzone: false });
    if (typeof file == "string") {
      this.setState({ custom_image_src: file });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e: any) => {
      if (!this.is_mounted) {
        return;
      }
      this.setState({ custom_image_src: e.target.result });
    };
    reader.readAsDataURL(file);
  };

  handle_image_file_upload = (e: any) => {
    const files = e.target.files;
    let file: File | undefined;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      file = files[0];
    }
    if (file == null) return;
    this.handle_image_file(file);
  };

  handle_image_file_drop = (e: any) => {
    e.preventDefault();
    e.stopPropagation();
    const items = e.dataTransfer.files;
    for (const item of items) {
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

  handle_image_file_paste = (e: any) => {
    e.preventDefault();
    const items = e.clipboardData.items;
    for (const item of items) {
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

  handle_image_file_input = (e: any) => {
    e.preventDefault();
    const files = e.target.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      this.handle_image_file(files[0]);
    }
  };

  render_options_gravatar() {
    if (!this.props.email_address) {
      return;
    }
    return (
      <>
        <Button
          style={{ marginTop: "5px" }}
          onClick={this.handle_gravatar_click}
        >
          Gravatar
        </Button>{" "}
        <a
          href="#"
          onClick={(e) => {
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
            <a href="https://en.gravatar.com" target="_blank" rel="noopener">
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
      </>
    );
  }

  render_options_adorable() {
    if (!this.props.email_address) {
      return;
    }
    return (
      <>
        <Button
          style={{ marginTop: "5px" }}
          onClick={this.handle_adorable_click}
        >
          Adorable
        </Button>{" "}
        <a
          href="#"
          onClick={(e) => {
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
            <a href="http://avatars.adorable.io" target="_blank" rel="noopener">
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
      </>
    );
  }

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
          onClick={(e) => {
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
        {this.render_options_gravatar()}
        {this.render_options_adorable()}
        <FormControl
          type="file"
          onChange={this.handle_image_file_input}
          className="btn btn-default"
          style={{ marginTop: "5px" }}
        />
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

  async handle_save_cropping(): Promise<void> {
    this.setState({ custom_image_src: undefined });
    try {
      this.set_image(this.state.croppedImageUrl || "");
    } catch (err) {
      console.warn("ERROR cropping -- ", err);
      this.setState({ error: `${err}` });
    }
  }

  async makeClientCrop(crop): Promise<void> {
    if (this.imageRef && crop.width && crop.height) {
      const croppedImageUrl = await getCroppedImg(this.imageRef, crop);
      this.setState({ croppedImageUrl });
    }
  }

  render_crop_selection(): Rendered {
    return (
      <>
        {this.state.custom_image_src && (
          <ReactCropComponent
            src={this.state.custom_image_src}
            crop={this.state.crop}
            circularCrop={true}
            minWidth={20}
            minHeight={20}
            onChange={(crop) => {
              this.setState({ crop });
            }}
            onImageLoaded={(image) => {
              this.imageRef = image;
            }}
            onComplete={(crop) => this.makeClientCrop(crop)}
          />
        )}
        {this.state.croppedImageUrl && (
          <>
            Preview: <ProfileIcon url={this.state.croppedImageUrl} size={42} />
          </>
        )}
        <br />
        <ButtonToolbar>
          <Button
            style={{ marginTop: "5px" }}
            onClick={() => this.handle_save_cropping()}
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

  render_error(): Rendered {
    if (this.state.error == null) {
      return;
    }
    return (
      <ErrorDisplay
        error={this.state.error}
        onClose={() => this.setState({ error: undefined })}
      />
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
        {this.render_error()}
        <br />
        {this.render_options()}
      </>
    );
  }
}

/**
 * @param {File} image - Image File Object
 * @param {Object} pixelCrop - pixelCrop Object provided by react-image-crop
 *
 * Returns a Base64 string
 */
async function getCroppedImg(image, crop: ReactCrop.Crop): Promise<string> {
  // Higher quality cropping upon completion of
  // https://github.com/DominicTobias/react-image-crop/issues/263
  if (crop.width == null || crop.height == null) {
    throw Error("Error cropping image -- width and height not set");
  }
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d");
  if (ctx == null) {
    throw Error("Error cropping image; please retry later");
  }

  ctx.drawImage(
    image,
    (crop as any).x * scaleX,
    (crop as any).y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    crop.width,
    crop.height
  );

  // Resize to at most AVATAR_SIZE.
  if (crop.width > AVATAR_SIZE || crop.height > AVATAR_SIZE) {
    const canvas2 = document.createElement("canvas");
    canvas2.width = AVATAR_SIZE;
    canvas2.height = AVATAR_SIZE;
    const pica = require("pica")();
    await pica.resize(canvas, canvas2);
    return canvas2.toDataURL("image/jpeg");
  } else {
    return canvas.toDataURL("image/jpeg");
  }
}
