import { useRedux } from "@cocalc/frontend/app-framework";
import { getUserName } from "./chat-log";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";

export default function Composing({ projectId, path, accountId, userMap }) {
  const drafts = useRedux(["drafts"], projectId, path);

  if (!drafts || drafts.size == 0) {
    return null;
  }

  const v: React.JSX.Element[] = [];
  const cutoff = Date.now() - 1000 * 30; // 30s
  for (const [senderId] of drafts) {
    if (accountId == senderId) {
      // this is us
      continue;
    }
    const record = drafts.get(senderId);
    if (record.get("date") != 0) {
      // editing an already sent message, rather than composing a new one.
      // This is indicated elsewhere (at that message).
      continue;
    }
    if (record.get("active") < cutoff || !record.get("input")?.trim()) {
      continue;
    }
    v.push(
      <div
        key={senderId}
        style={{ margin: "5px", color: "#666", textAlign: "center" }}
      >
        <Avatar size={20} account_id={senderId} />
        <span style={{ marginLeft: "15px" }}>
          {getUserName(userMap, senderId)} is writing a message...
        </span>
        {senderId?.startsWith("chatgpt") && (
          <ProgressEstimate
            style={{ marginLeft: "15px", maxWidth: "600px" }}
            seconds={5 /* seconds until answer starts stream */}
          />
        )}
      </div>,
    );
    // NOTE: We use a longer chatgpt estimate here than in the frontend nextjs
    // app, since the nature of questions when you're fully using cocalc
    // is that they tend to be much deeper.
  }
  if (v.length == 0) return null;
  return <div>{v}</div>;
}
