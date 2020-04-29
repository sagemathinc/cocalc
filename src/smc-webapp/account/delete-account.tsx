import { Component, React, Rendered, rtypes } from "../app-framework";
import { Button, ButtonToolbar, Well } from "../antd-bootstrap";
import { ErrorDisplay, Icon, A } from "../r_misc";

interface Props {
  initial_click: () => void;
  confirm_click: () => void;
  cancel_click: () => void;
  user_name: string;
  show_confirmation?: boolean;
  style?: React.CSSProperties;
}

export function DeleteAccount(props: Props) {
  return (
    <div>
      <div style={{ height: "26px" }}>
        <Button
          disabled={props.show_confirmation}
          className="pull-right"
          bsStyle="danger"
          style={props.style}
          onClick={props.initial_click}
        >
          <Icon name="trash" /> Delete Account...
        </Button>
      </div>
      {props.show_confirmation ? (
        <DeleteAccountConfirmation
          confirm_click={props.confirm_click}
          cancel_click={props.cancel_click}
          required_text={props.user_name}
        />
      ) : undefined}
    </div>
  );
}

interface ConfProps {
  confirm_click: () => void;
  cancel_click: () => void;
  required_text: string;
}

interface ReduxConfProps {
  account_deletion_error?: string;
}

interface State {
  confirmation_text: string;
}

// Concious choice to make them actually click the confirm delete button.
class DeleteAccountConfirmation extends Component<
  ConfProps & ReduxConfProps,
  State
> {
  constructor(props, state) {
    super(props, state);
    // State is lost on re-render from cancel. But this is what we want.
    this.state = { confirmation_text: "" };
  }

  static reduxProps() {
    return {
      account: {
        account_deletion_error: rtypes.string,
      },
    };
  }

  private render_error(): Rendered {
    if (this.props.account_deletion_error == null) {
      return;
    }
    return <ErrorDisplay error={this.props.account_deletion_error} />;
  }

  public render(): Rendered {
    return (
      <Well
        style={{
          marginTop: "26px",
          textAlign: "center",
          fontSize: "15pt",
          backgroundColor: "darkred",
          color: "white",
        }}
      >
        Are you sure you want to DELETE YOUR ACCOUNT?
        <br />
        You will <span style={{ fontWeight: "bold" }}>immediately</span> lose
        access to <span style={{ fontWeight: "bold" }}>all</span> of your
        projects, and any subscriptions will be canceled.
        <br />
        <hr style={{ marginTop: "10px", marginBottom: "10px" }} />
        Do NOT delete your account if you are a current student in a course on
        CoCalc!{" "}
        <A href="https://github.com/sagemathinc/cocalc/issues/3243">Why?</A>
        <hr style={{ marginTop: "10px", marginBottom: "10px" }} />
        To DELETE YOUR ACCOUNT, enter "{this.props.required_text}" below:
        <br />
        <input
          autoFocus
          value={this.state.confirmation_text}
          placeholder="Full name"
          type="text"
          onChange={(e) => {
            this.setState({ confirmation_text: (e.target as any).value });
          }}
          style={{
            marginTop: "1ex",
            padding: "5px",
            color: "black",
            width: "90%",
          }}
        />
        <ButtonToolbar style={{ textAlign: "center", marginTop: "15px" }}>
          <Button
            disabled={this.state.confirmation_text !== this.props.required_text}
            bsStyle="danger"
            onClick={() => this.props.confirm_click()}
          >
            <Icon name="trash" /> Yes, DELETE MY ACCOUNT
          </Button>
          <Button bsStyle="primary" onClick={this.props.cancel_click}>
            Cancel
          </Button>
        </ButtonToolbar>
        {this.render_error()}
      </Well>
    );
  }
}
