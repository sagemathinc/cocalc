/*
Component for adding one or more students to the course.
*/

import { Alert, Button, Col, Flex, Form, Input, Row, Space } from "antd";
import { concat, sortBy } from "lodash";
import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  redux,
  useActions,
  useIsMountedRef,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import { labels } from "@cocalc/frontend/i18n";
import type { UserMap } from "@cocalc/frontend/todo-types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  dict,
  is_valid_uuid_string,
  keys,
  parse_user_search,
  trunc,
} from "@cocalc/util/misc";
import type { CourseActions } from "../actions";
import type { StudentsMap } from "../store";

interface Props {
  name: string;
  students: StudentsMap;
  user_map: UserMap;
  project_id;
  close?: Function;
}

export default function AddStudents({
  name,
  students,
  user_map,
  project_id,
  close,
}: Props) {
  const intl = useIntl();
  const addSelectRef = useRef<HTMLSelectElement>(null);
  const studentAddInputRef = useRef<any>(null);
  const actions = useActions<CourseActions>({ name });
  const [studentInputFocused, setStudentInputFocused] =
    useState<boolean>(false);
  const [err, set_err] = useState<string | undefined>(undefined);
  const [add_search, set_add_search] = useState<string>("");
  const [add_searching, set_add_searching] = useState<boolean>(false);
  const [add_select, set_add_select] = useState<any>(undefined);
  const [existing_students, set_existing_students] = useState<any | undefined>(
    undefined,
  );
  const [selected_option_nodes, set_selected_option_nodes] = useState<
    any | undefined
  >(undefined);
  const [selected_option_num, set_selected_option_num] = useState<number>(0);
  const isMounted = useIsMountedRef();

  useEffect(() => {
    set_selected_option_num(selected_option_nodes?.length ?? 0);
  }, [selected_option_nodes]);

  async function do_add_search(e, only_email = true): Promise<void> {
    // Search for people to add to the course
    if (e != null) {
      e.preventDefault();
    }
    if (students == null) return;
    // already searching
    if (add_searching) return;
    const search = add_search.trim();
    if (search.length === 0) {
      set_err(undefined);
      set_add_select(undefined);
      set_existing_students(undefined);
      set_selected_option_nodes(undefined);
      return;
    }
    set_add_searching(true);
    set_add_select(undefined);
    set_existing_students(undefined);
    set_selected_option_nodes(undefined);
    let select;
    try {
      select = await webapp_client.users_client.user_search({
        query: add_search,
        limit: 150,
        only_email,
      });
    } catch (err) {
      if (!isMounted) return;
      set_add_searching(false);
      set_err(err);
      set_add_select(undefined);
      set_existing_students(undefined);
      return;
    }
    if (!isMounted) return;

    // Get the current collaborators/owners of the project that
    // contains the course.
    const users = redux.getStore("projects").get_users(project_id);
    // Make a map with keys the email or account_id is already part of the course.
    const already_added: { [key: string]: boolean } = (users?.toJS() ??
      {}) as any; // start with collabs on project
    // also track **which** students are already part of the course
    const existing_students: any = {};
    existing_students.account = {};
    existing_students.email = {};
    // For each student in course add account_id and/or email_address:
    students.map((val) => {
      for (const n of ["account_id", "email_address"] as const) {
        const k = val.get(n);
        if (k != null) {
          already_added[k] = true;
        }
      }
    });
    // This function returns true if we shouldn't list the given account_id or email_address
    // in the search selector for adding to the class.
    const exclude_add = (account_id, email_address): boolean => {
      const aa = already_added[account_id] || already_added[email_address];
      if (aa) {
        if (account_id != null) {
          existing_students.account[account_id] = true;
        }
        if (email_address != null) {
          existing_students.email[email_address] = true;
        }
      }
      return aa;
    };
    const select2 = select.filter(
      (x) => !exclude_add(x.account_id, x.email_address),
    );
    // Put at the front of the list any email addresses not known to CoCalc (sorted in order) and also not invited to course.
    // NOTE (see comment on https://github.com/sagemathinc/cocalc/issues/677): it is very important to pass in
    // the original select list to nonclude_emails below, **NOT** select2 above.  Otherwise, we end up
    // bringing back everything in the search, which is a bug.
    const unknown = noncloud_emails(select, add_search).filter(
      (x) => !exclude_add(null, x.email_address),
    );
    const select3 = concat(unknown, select2);
    // We are no longer searching, but now show an options selector.
    set_add_searching(false);
    set_add_select(select3);
    set_existing_students(existing_students);
  }

  function student_add_button() {
    const disabled = add_search?.trim().length === 0;
    const icon = add_searching ? (
      <Icon name="cocalc-ring" spin />
    ) : (
      <Icon name="search" />
    );

    return (
      <Flex vertical={true} align="start" gap={5}>
        <Button
          type="primary"
          onClick={(e) => do_add_search(e, true)}
          icon={icon}
          disabled={disabled}
        >
          Search by Email Address (shift+enter)
        </Button>
        <Button
          onClick={(e) => do_add_search(e, false)}
          icon={icon}
          disabled={disabled}
        >
          Search by Name
        </Button>
      </Flex>
    );
  }

  function add_selector_changed(e): void {
    const opts = e.target.selectedOptions;
    // It's important to make a shallow copy, because somehow this array is modified in-place
    // and hence this call to set the array doesn't register a change (e.g. selected_option_num stays in sync)
    set_selected_option_nodes([...opts]);
  }

  function add_selected_students(options) {
    const emails = {};
    for (const x of add_select) {
      if (x.account_id != null) {
        emails[x.account_id] = x.email_address;
      }
    }
    const students: any[] = [];
    const selections: any[] = [];

    // first check, if no student is selected and there is just one in the list
    if (
      (selected_option_nodes == null || selected_option_nodes?.length === 0) &&
      options?.length === 1
    ) {
      selections.push(options[0].key);
    } else {
      for (const option of selected_option_nodes) {
        selections.push(option.getAttribute("value"));
      }
    }

    for (const y of selections) {
      if (is_valid_uuid_string(y)) {
        students.push({
          account_id: y,
          email_address: emails[y],
        });
      } else {
        students.push({ email_address: y });
      }
    }
    actions.students.add_students(students);
    clear();
    close?.();
  }

  function add_all_students() {
    const students: any[] = [];
    for (const entry of add_select) {
      const { account_id } = entry;
      if (is_valid_uuid_string(account_id)) {
        students.push({
          account_id,
          email_address: entry.email_address,
        });
      } else {
        students.push({ email_address: entry.email_address });
      }
    }
    actions.students.add_students(students);
    clear();
    close?.();
  }

  function clear(): void {
    set_err(undefined);
    set_add_select(undefined);
    set_selected_option_nodes(undefined);
    set_add_search("");
    set_existing_students(undefined);
  }

  function get_add_selector_options() {
    const v: any[] = [];
    const seen = {};
    for (const x of add_select) {
      const key = x.account_id != null ? x.account_id : x.email_address;
      if (seen[key]) continue;
      seen[key] = true;
      const student_name =
        x.account_id != null
          ? x.first_name + " " + x.last_name
          : x.email_address;
      const email =
        x.account_id != null && x.email_address
          ? " (" + x.email_address + ")"
          : "";
      v.push(
        <option key={key} value={key} label={student_name + email}>
          {student_name + email}
        </option>,
      );
    }
    return v;
  }

  function render_add_selector() {
    if (add_select == null) return;
    const options = get_add_selector_options();
    return (
      <>
        <Form.Item style={{ margin: "5px 0 15px 0" }}>
          <select
            style={{
              width: "100%",
              border: "1px solid lightgray",
              padding: "4px 11px",
            }}
            multiple
            ref={addSelectRef}
            size={8}
            onChange={add_selector_changed}
          >
            {options}
          </select>
        </Form.Item>
        <Space>
          {render_cancel()}
          {render_add_selector_button(options)}
          {render_add_all_students_button(options)}
        </Space>
      </>
    );
  }

  function get_add_selector_button_text(existing) {
    switch (selected_option_num) {
      case 0:
        return intl.formatMessage(
          {
            id: "course.add-students.add-selector-button.case0",
            defaultMessage: `{existing, select,
              true {Student already added}
              other {Select student(s)}}`,
          },
          { existing },
        );

      case 1:
        return intl.formatMessage({
          id: "course.add-students.add-selector-button.case1",
          defaultMessage: "Add student",
        });
      default:
        return intl.formatMessage(
          {
            id: "course.add-students.add-selector-button.caseDefault",
            defaultMessage: `{num, select,
              0 {Select student above}
              1 {Add selected student}
              other {Add {num} students}}`,
          },
          { num: selected_option_num },
        );
    }
  }

  function render_add_selector_button(options) {
    let existing;
    const es = existing_students;
    if (es != null) {
      existing = keys(es.email).length + keys(es.account).length > 0;
    } else {
      // es not defined when user clicks the close button on the warning.
      existing = 0;
    }
    const btn_text = get_add_selector_button_text(existing);
    const disabled =
      options.length === 0 ||
      (options.length >= 1 && selected_option_num === 0);
    return (
      <Button
        onClick={() => add_selected_students(options)}
        disabled={disabled}
      >
        <Icon name="user-plus" /> {btn_text}
      </Button>
    );
  }

  function render_add_all_students_button(options) {
    return (
      <Button
        onClick={() => add_all_students()}
        disabled={options.length === 0}
      >
        <Icon name={"user-plus"} />{" "}
        <FormattedMessage
          id="course.add-students.add-all-students.button"
          defaultMessage={"Add all students"}
          description={"Students in an online course"}
        />
      </Button>
    );
  }

  function render_cancel() {
    return (
      <Button onClick={() => clear()}>
        {intl.formatMessage(labels.cancel)}
      </Button>
    );
  }

  function render_error_display() {
    if (err) {
      return <ShowError error={trunc(err, 1024)} setError={set_err} />;
    } else if (existing_students != null) {
      const existing: any[] = [];
      for (const email in existing_students.email) {
        existing.push(email);
      }
      for (const account_id in existing_students.account) {
        const user = user_map.get(account_id);
        // user could be null, since there is no guaranteee about what is in user_map.
        if (user != null) {
          existing.push(`${user.get("first_name")} ${user.get("last_name")}`);
        } else {
          existing.push(`Student with account ${account_id}`);
        }
      }
      if (existing.length > 0) {
        const existingStr = existing.join(", ");
        const msg = `Already added (or deleted) students or project collaborators: ${existingStr}`;
        return (
          <Alert
            type="info"
            message={msg}
            style={{ margin: "15px 0" }}
            closable
            onClose={() => set_existing_students(undefined)}
          />
        );
      }
    }
  }

  function render_error() {
    const ed = render_error_display();
    if (ed != null) {
      return (
        <Col md={24} style={{ marginBottom: "20px" }}>
          {ed}
        </Col>
      );
    }
  }

  function student_add_input_onChange() {
    const value =
      (studentAddInputRef?.current as any).resizableTextArea?.textArea.value ??
      "";
    set_add_select(undefined);
    set_add_search(value);
  }

  function student_add_input_onKeyDown(e) {
    // ESC key
    if (e.keyCode === 27) {
      set_add_search("");
      set_add_select(undefined);

      // Shift+Return
    } else if (e.keyCode === 13 && e.shiftKey) {
      e.preventDefault();
      student_add_input_onChange();
      do_add_search(e);
    }
  }

  const rows = add_search.trim().length == 0 && !studentInputFocused ? 1 : 4;

  const placeholder = "Add students by email address or name...";

  return (
    <Form onFinish={do_add_search} style={{ marginLeft: "15px" }}>
      <Row>
        <Col md={14}>
          <Form.Item style={{ margin: "0 0 5px 0" }}>
            <Input.TextArea
              ref={studentAddInputRef}
              placeholder={placeholder}
              value={add_search}
              rows={rows}
              onChange={() => student_add_input_onChange()}
              onKeyDown={(e) => student_add_input_onKeyDown(e)}
              onFocus={() => setStudentInputFocused(true)}
              onBlur={() => setStudentInputFocused(false)}
            />
          </Form.Item>
        </Col>
        <Col md={10}>
          <div style={{ marginLeft: "15px", width: "100%" }}>
            {student_add_button()}
          </div>
        </Col>
        <Col md={24}>{render_add_selector()}</Col>
        {render_error()}
      </Row>
    </Form>
  );
}

// Given a list v of user_search results, and a search string s,
// return entries for each email address not in v, in order.
function noncloud_emails(v, s) {
  const { email_queries } = parse_user_search(s);

  const result_emails = dict(
    v
      .filter((r) => r.email_address != null)
      .map((r) => [r.email_address, true]),
  );

  return sortBy(
    email_queries
      .filter((r) => !result_emails[r])
      .map((r) => {
        return { email_address: r };
      }),
    "email_address",
  );
}
