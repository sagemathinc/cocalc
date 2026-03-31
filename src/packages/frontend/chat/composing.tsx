import { useRedux } from "@cocalc/frontend/app-framework";
import { getUserName } from "./chat-log";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { CHAT_COMPOSING_TEXT } from "./chat-colors";

export default function Composing({
  projectId,
  path,
  accountId,
  userMap,
  selectedThread,
}: {
  projectId: string;
  path: string;
  accountId: string;
  userMap;
  selectedThread?: string;
}) {
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
    const draftDate = record.get("date");
    if (draftDate != 0 && draftDate != null) {
      // Positive date = editing an already sent message, indicated elsewhere.
      // Negative date = composing a reply in a specific thread.
      if (draftDate > 0) continue;
      // For thread replies (date < 0), check if this belongs to the current thread
      const draftThreadKey = `${Math.abs(draftDate)}`;
      if (selectedThread && draftThreadKey !== selectedThread) {
        // composing in a different thread — skip
        continue;
      }
      if (!selectedThread) {
        // we're in the main view, not a specific thread — skip thread replies
        continue;
      }
    }
    // Note: date=0 drafts are shown in all views (including thread view)
    // because the composer uses date=0 for thread replies too — the
    // reply_to is only set at send time, not during drafting.
    if (record.get("active") < cutoff || !record.get("input")?.trim()) {
      continue;
    }
    v.push(
      <div
        key={senderId}
        style={{ margin: "5px", color: CHAT_COMPOSING_TEXT, textAlign: "center" }}
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
