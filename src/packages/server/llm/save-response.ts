import getLogger from "@cocalc/backend/logger";
import getPool from "@cocalc/database/pool";
import { pii_retention_to_future } from "@cocalc/database/postgres/pii";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { LLMLogEntry } from "@cocalc/util/db-schema/llm";

const log = getLogger("llm:save-response");

// time, id is set by the database, and expire in the saveResponse function
type SaveResponseProps = Omit<LLMLogEntry, "time" | "id" | "expire">;

// Save the response to the database.

// Save mainly for analytics, metering, and to generally see how (or if)
// people use chatgpt in cocalc.
// Also, we could dedup identical inputs (?).
export async function saveResponse({
  account_id,
  analytics_cookie,
  history,
  input,
  model,
  output,
  path,
  project_id,
  prompt_tokens,
  system,
  tag,
  total_time_s,
  total_tokens,
}: SaveResponseProps) {
  const expire: LLMLogEntry["expire"] = await getExpiration(account_id);
  const pool = getPool();
  try {
    await pool.query(
      "INSERT INTO openai_chatgpt_log(time,input,system,output,history,account_id,analytics_cookie,project_id,path,total_tokens,prompt_tokens,total_time_s,expire,model,tag) VALUES(NOW(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        input,
        system,
        output,
        history,
        account_id,
        analytics_cookie,
        project_id,
        path,
        total_tokens,
        prompt_tokens,
        total_time_s,
        expire,
        model,
        tag,
      ],
    );
  } catch (err) {
    log.warn("Failed to save language model log entry to database:", err);
  }
}

async function getExpiration(account_id: string | undefined) {
  // NOTE about expire: If the admin setting for "PII Retention" is set *and*
  // the usage is only identified by their analytics_cookie, then
  // we automatically delete the log of chatgpt usage at the expiration time.
  // If the account_id *is* set, users can do the following:
  // 1. Ability to delete any of their past chatgpt usage
  // 2. If a user deletes their account, also delete their past chatgpt usage log.
  // 3. Make it easy to search and see their past usage.
  // See https://github.com/sagemathinc/cocalc/issues/6577
  // There's no reason to automatically delete "PII" attached
  // to an actual user that has access to that data (and can delete it); otherwise,
  // we would have to delete every single thing anybody types anywhere in cocalc,
  // e.g., when editing a Jupyter notebook or really anything else at all, and
  // that makes no sense at all.
  if (account_id == null) {
    // this never happens right now since it's disabled; we may
    // bring this back with captcha
    const { pii_retention } = await getServerSettings();
    return pii_retention_to_future(pii_retention);
  } else {
    return undefined;
  }
}
