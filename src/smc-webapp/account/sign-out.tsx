import { Component, React, Rendered, redux } from "../app-framework";
import { Button, Popconfirm } from "antd";

export class SignOut extends Component<{ everywhere?: boolean }, {}> {
  private sign_out(): void {
    const account = redux.getActions("account");
    if (account != null) {
      account.sign_out(!!this.props.everywhere);
    }
  }

  public render(): Rendered {
    // I think not using reduxProps is fine for this, since it's only rendered once
    // you are signed in, and falling back to "your account" isn't bad.
    const store = redux.getStore("account");
    let account: string | undefined = store.get("email_address");
    if (!account) {
      account = "your account";
    }
    let title: string = `Are you sure you want to sign ${account} out `;
    if (this.props.everywhere) {
      title +=
        "on all web browsers? Every web browser will have to reauthenticate before using this account again.";
    } else {
      title += "on this web browser?";
    }
    if (store.get('is_anonymous')) {
      title +=
        "\n Everything you have done using this TEMPORARY ACCOUNT will be immediately deleted!  If you would like to save your work, click cancel and sign up above.";
    }
    return (
      <Popconfirm
        title={<div style={{ maxWidth: "60ex" }}>{title}</div>}
        onConfirm={this.sign_out.bind(this)}
        okText={`Yes, sign out${this.props.everywhere ? " everywhere" : ""}`}
        cancelText={"Cancel"}
      >
        <Button icon={"logout"}>
          Sign out{this.props.everywhere ? " everywhere" : ""}...
        </Button>
      </Popconfirm>
    );
  }
}
