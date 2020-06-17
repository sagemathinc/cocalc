/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new project
*/

import {
  React,
  ReactDOM,
  redux,
  useEffect,
  useIsMountedRef,
  useRef,
  useState,
  useRedux,
} from "../app-framework";

import { ComputeImages, ComputeImageTypes } from "../custom-software/init";
import { custom_image_name } from "../custom-software/util";

import { delay } from "awaiting";

import { CustomSoftware } from "../custom-software/selector";

import {
  Well,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Alert,
} from "../antd-bootstrap";

import { Row, Col } from "antd";

import { A, ErrorDisplay, Icon, Space } from "../r_misc";

const official: ComputeImageTypes = "official";
const custom: ComputeImageTypes = "custom";

interface Props {
  start_in_edit_mode?: boolean;
  default_value?: string;
}

type EditState = "edit" | "view" | "saving";

export const NewProjectCreator: React.FC<Props> = ({
  start_in_edit_mode,
  default_value,
}: Props) => {
  const images: ComputeImages | undefined = useRedux([
    "compute_images",
    "images",
  ]);
  // view --> edit --> saving --> view
  const [state, set_state] = useState<EditState>(
    start_in_edit_mode ? "edit" : "view"
  );
  const [title_text, set_title_text] = useState<string>(default_value ?? "");
  const [error, set_error] = useState<string>("");
  const [show_advanced, set_show_advanced] = useState<boolean>(false);
  const [image_selected, set_image_selected] = useState<string | undefined>(
    undefined
  );
  const [image_type, set_image_type] = useState<ComputeImageTypes>(official);
  // title_prefill toggles form true → false after first edit
  const [title_prefill, set_title_prefill] = useState<boolean>(true);

  const new_project_title_ref = useRef(null);

  useEffect(() => {
    select_text();
  }, []);

  const is_mounted_ref = useIsMountedRef();

  async function select_text(): Promise<void> {
    // wait for next render loop so the title actually is in the DOM...
    await delay(1);
    ReactDOM.findDOMNode(new_project_title_ref.current)?.select();
  }

  function start_editing(): void {
    set_state("edit");
    set_title_text(default_value ?? "");
    select_text();
  }

  function cancel_editing(): void {
    if (!is_mounted_ref.current) return;
    set_state("view");
    set_title_text(default_value ?? "");
    set_error("");
    set_show_advanced(false);
    set_image_selected(undefined);
    set_image_type(official);
    set_title_prefill(true);
  }

  function toggle_editing(): void {
    if (state === "view") {
      start_editing();
    } else {
      cancel_editing();
    }
  }

  async function create_project(): Promise<void> {
    set_state("saving");
    const actions = redux.getActions("projects");
    const image: string =
      image_type == custom && image_selected != null
        ? custom_image_name(image_selected)
        : "default";
    let project_id: string;
    try {
      project_id = await actions.create_project({
        title: title_text,
        image,
        start: false, // do NOT want to start, due to apply_default_upgrades
      });
    } catch (err) {
      if (!is_mounted_ref.current) return;
      set_state("edit");
      set_error(`Error creating project -- ${err}`);
      return;
    }
    // We also update the customer billing information so apply_default_upgrades works.
    const billing_actions = redux.getActions("billing");
    if (billing_actions != null) {
      try {
        await billing_actions.update_customer();
        await actions.apply_default_upgrades({ project_id }); // see issue #4192
      } catch (err) {
        // Ignore error coming from this -- it's merely a convenience to
        // upgrade the project on creation; user could always do it manually,
        // and nothing in the UI guarantees it will happen.
      }
    }
    // switch_to=true is perhaps suggested by #4088
    actions.open_project({ project_id, switch_to: true });
    cancel_editing();
  }

  function render_info_alert(): JSX.Element | undefined {
    if (state === "saving") {
      return (
        <div style={{ marginTop: "30px" }}>
          <Alert bsStyle="info">
            <Icon name="cc-icon-cocalc-ring" spin />
            <Space /> Creating project...
          </Alert>
        </div>
      );
    }
  }

  function render_error(): JSX.Element | undefined {
    if (error) {
      return (
        <div style={{ marginTop: "30px" }}>
          <ErrorDisplay error={error} onClose={() => set_error("")} />
        </div>
      );
    }
  }

  function render_new_project_button(): JSX.Element {
    return (
      <Row>
        <Col xs={24}>
          <Button
            cocalc-test={"create-project"}
            bsStyle={"success"}
            bsSize={"large"}
            disabled={state !== "view"}
            onClick={toggle_editing}
            style={{ width: "100%" }}
          >
            <Icon name="plus-circle" /> Create New Project...
          </Button>
        </Col>
      </Row>
    );
  }

  function create_disabled() {
    return (
      // no name of new project
      title_text === "" ||
      // currently saving (?)
      state === "saving" ||
      // user wants a custom image, but hasn't selected one yet
      (image_type === custom && image_selected == null)
    );
  }

  function set_title(text: string): void {
    set_title_text(text);
    set_title_prefill(false);
  }

  function input_on_change(): void {
    const text = ReactDOM.findDOMNode(new_project_title_ref.current)?.value;
    set_title(text);
  }

  function handle_keypress(e): void {
    if (e.keyCode === 27) {
      cancel_editing();
    } else if (e.keyCode === 13 && title_text !== "") {
      create_project();
    }
  }

  function customer_software_set_state(obj: {
    image_selected?: string;
    title_text?: string;
    image_type?: ComputeImageTypes;
  }): void {
    if (obj.image_selected != null) {
      set_image_selected(obj.image_selected);
    }
    if (obj.title_text != null) {
      set_title_text(obj.title_text);
    }
    if (obj.image_type != null) {
      set_image_type(obj.image_type);
    }
  }

  function render_advanced() {
    if (!show_advanced) return;
    return (
      <CustomSoftware
        setParentState={customer_software_set_state}
        images={images}
        image_selected={image_selected}
        image_type={image_type}
        title_prefill={title_prefill}
      />
    );
  }

  function render_advanced_toggle(): JSX.Element | undefined {
    if (show_advanced) return;
    return (
      <div style={{ margin: "10px 0 0" }}>
        <a
          onClick={() => set_show_advanced(true)}
          style={{ cursor: "pointer" }}
        >
          <b>Software environment...</b>
        </a>
      </div>
    );
  }

  function render_input_section(): JSX.Element | undefined {
    return (
      <Well style={{ backgroundColor: "#FFF" }}>
        <Row>
          <Col sm={12}>
            <FormGroup>
              <FormControl
                ref={new_project_title_ref}
                type="text"
                placeholder="Project title"
                disabled={state === "saving"}
                value={title_text}
                onChange={input_on_change}
                onKeyDown={handle_keypress}
                autoFocus
              />
            </FormGroup>
            {render_advanced_toggle()}
          </Col>
          <Col sm={12}>
            <div style={{ color: "#666", marginLeft: "30px" }}>
              A <A href="https://doc.cocalc.com/project.html">project</A> is an
              isolated private computational workspace that you can share with
              others. You can easily change the project's title at any time in
              project settings.
            </div>
          </Col>
        </Row>
        {render_advanced()}
        <Row>
          <Col sm={24} style={{ marginTop: "10px" }}>
            <ButtonToolbar>
              <Button disabled={state === "saving"} onClick={cancel_editing}>
                Cancel
              </Button>
              <Button
                disabled={create_disabled()}
                onClick={() => create_project()}
                bsStyle="success"
              >
                Create Project
              </Button>
            </ButtonToolbar>
          </Col>
        </Row>
        <Row>
          <Col sm={24}>
            {render_error()}
            {render_info_alert()}
          </Col>
        </Row>
      </Well>
    );
  }

  function render_project_creation(): JSX.Element | undefined {
    if (state == "view") return;
    return (
      <Row style={{ width: "100%", paddingBottom: "20px" }}>
        <Col sm={24}>
          <Space />
          {render_input_section()}
        </Col>
      </Row>
    );
  }

  return (
    <div>
      {render_new_project_button()}
      {render_project_creation()}
    </div>
  );
};
