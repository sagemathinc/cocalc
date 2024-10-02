import { Alert, Divider, Layout, Tag, Timeline, Tooltip } from "antd";
import { ReactNode } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { capitalize, trunc } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Title } from "components/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import { MAX_WIDTH } from "lib/config";
import { useCustomize } from "lib/customize";
import useAPI from "lib/hooks/api";
import type { Type } from "./create";
import { NoZendesk } from "./util";

export default function Tickets() {
  let { result, error } = useAPI("support/tickets");
  const { zendesk } = useCustomize();

  if (!zendesk) {
    return <NoZendesk />;
  }
  return (
    <Layout.Content style={{ backgroundColor: "white" }}>
      <div
        style={{
          maxWidth: MAX_WIDTH,
          margin: "15px auto",
          padding: "15px",
          backgroundColor: "white",
          color: COLORS.GRAY_D,
        }}
      >
        <Title level={1} style={{ textAlign: "center" }}>
          Support Tickets
        </Title>
        <p style={{ fontSize: "12pt" }}>
          Check the status of your support tickets here or{" "}
          <A href="/support/new">create a new ticket</A>. Newly created tickets
          do not appear here for a few minutes.
        </p>
        {error && (
          <Alert
            style={{ margin: "30px 0" }}
            type="error"
            message={"Error loading support tickets"}
            description={error}
          />
        )}
        <Divider>Tickets</Divider>
        <br />
        {result ? (
          <SupportTimeline tickets={result.tickets} />
        ) : (
          <Loading style={{ fontSize: "20pt" }} />
        )}
      </div>
    </Layout.Content>
  );
}

function SupportTimeline({ tickets }) {
  const v: ReactNode[] = [];
  for (const ticket of tickets ?? []) {
    v.push(
      <Timeline.Item key={ticket.id} color={statusToColor(ticket.status)}>
        <Ticket ticket={ticket} />
      </Timeline.Item>,
    );
  }
  return <Timeline>{v}</Timeline>;
}

const COLOR = {
  new: "orange",
  open: "orange",
  pending: "red",
  solved: "#666",
};

function statusToColor(status: string): string {
  return COLOR[status] ?? "#f5ca00";
}

function Ticket({ ticket }) {
  const {
    id,
    userURL,
    created_at,
    updated_at,
    description,
    status,
    subject,
    type,
  } = ticket;
  return (
    <div style={{ marginBottom: "15px" }}>
      <div style={{ float: "right" }}>
        <Type type={type} status={status} />
      </div>
      <A href={userURL}>
        <Status status={status} />
        <b style={{ fontSize: "13pt" }}>{trunc(subject, 80)}</b>
      </A>
      <br />
      <div style={{ float: "right" }}>
        <Tooltip title="Click to visit Zendesk and see all responses to your support request.">
          <A href={userURL}>
            <Icon name="external-link" /> Ticket: {id}
          </A>
        </Tooltip>
      </div>
      (created: {dateToString(created_at)}, updated: {dateToString(updated_at)})
      <br />
      <div
        style={{
          overflow: "auto",
          maxHeight: "30vh",
          border: "1px solid lightgrey",
          padding: "15px",
          marginTop: "5px",
          backgroundColor: "#fdfdfd",
          borderRadius: "3px",
        }}
      >
        <Markdown value={description} />
      </div>
    </div>
  );
}

// Note that this is what to show from the POV of the user.
// See https://github.com/sagemathinc/cocalc/issues/6239

interface StatusDescription {
  title: string;
  label: string;
  color: string;
}

const STATUS: { [status: string]: StatusDescription } = {
  pending: {
    title: "We are waiting for your response.",
    label: "AWAITING YOUR REPLY",
    color: "#f5ca00",
  },
  new: {
    title: "We are looking at your support request but have not responded yet.",
    label: "NEW",
    color: "#59bbe0" /* blue */,
  },
  open: {
    title: "We are trying to solve your support request.",
    label: "OPEN",
    color: "#59bbe0",
  },
  solved: {
    title: "This support request has been solved.",
    label: "SOLVED",
    color: "#666",
  },
};

function Status({ status }) {
  const { title, label, color } = STATUS[status] ?? {
    title: "",
    label: "Status",
    color: "blue",
  };
  return (
    <Tooltip title={title}>
      <Tag color={color} style={{ fontSize: "12pt", color: "white" }}>
        {label}
      </Tag>
    </Tooltip>
  );
}

const TYPE_COLOR: { [name in Type]: string } = {
  problem: "red",
  question: "blue",
  task: "orange",
  purchase: "green",
  chat: "purple",
};

export function Type({ status, type }: { status?: string; type: Type }) {
  return (
    <Tag
      color={status == "solved" ? COLORS.GRAY_M : TYPE_COLOR[type]}
      style={{ fontSize: "12pt" }}
    >
      {capitalize(type)}
    </Tag>
  );
}

function dateToString(d: string): string {
  try {
    return new Date(d).toLocaleString();
  } catch (_err) {
    return d;
  }
}
