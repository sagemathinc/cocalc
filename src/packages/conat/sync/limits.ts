import type { RawMsg } from "./core-stream";

export const ENFORCE_LIMITS_THROTTLE_MS = process.env.COCALC_TEST_MODE
  ? 100
  : 45000;

class PublishRejectError extends Error {
  code: string;
  mesg: any;
  subject?: string;
  limit?: string;
}

export interface FilteredStreamLimitOptions {
  // How many messages may be in a Stream, oldest messages will be removed
  // if the Stream exceeds this size. -1 for unlimited.
  max_msgs: number;
  // Maximum age of any message in the stream matching the filter,
  // expressed in milliseconds. 0 for unlimited.
  // **Note that max_age is in milliseoncds, NOT nanoseconds like in Nats!!!**
  max_age: number;
  // How big the Stream may be, when the combined stream size matching the filter
  // exceeds this old messages are removed. -1 for unlimited.
  // This is enforced only on write, so if you change it, it only applies
  // to future messages.
  max_bytes: number;
  // The largest message that will be accepted by the Stream. -1 for unlimited.
  max_msg_size: number;

  // Attempting to publish a message that causes this to be exceeded
  // throws an exception instead.  -1 (or 0) for unlimited
  // For dstream, the messages are explicitly rejected and the client
  // gets a "reject" event emitted.  E.g., the terminal running in the project
  // writes [...] when it gets these rejects, indicating that data was
  // dropped.
  max_bytes_per_second: number;
  max_msgs_per_second: number;
}

export function enforceLimits<T>({
  messages,
  raw,
  limits,
}: {
  messages: T[];
  raw: RawMsg[];
  limits: FilteredStreamLimitOptions;
}) {
  const { max_msgs, max_age, max_bytes } = limits;
  // we check with each defined limit if some old messages
  // should be dropped, and if so move limit forward.  If
  // it is above -1 at the end, we do the drop.
  let index = -1;
  const setIndex = (i, _limit) => {
    // console.log("setIndex", { i, _limit });
    index = Math.max(i, index);
  };
  // max_msgs
  // console.log({ max_msgs, l: messages.length, messages });
  if (max_msgs > -1 && messages.length > max_msgs) {
    // ensure there are at most limits.max_msgs messages
    // by deleting the oldest ones up to a specified point.
    const i = messages.length - max_msgs;
    if (i > 0) {
      setIndex(i - 1, "max_msgs");
    }
  }

  // max_age
  if (max_age > 0) {
    // expire messages older than max_age nanoseconds
    const recent = raw[raw.length - 1];
    if (recent != null) {
      // to avoid potential clock skew, we define *now* as the time of the most
      // recent message.  For us, this should be fine, since we only impose limits
      // when writing new messages, and none of these limits are guaranteed.
      const now = recent.timestamp;
      if (now) {
        const cutoff = now - max_age;
        for (let i = raw.length - 1; i >= 0; i--) {
          const t = raw[i].timestamp;
          if (t < cutoff) {
            // it just went over the limit.  Everything before
            // and including the i-th message must be deleted.
            setIndex(i, "max_age");
            break;
          }
        }
      }
    }
  }

  // max_bytes
  if (max_bytes >= 0) {
    let t = 0;
    for (let i = raw.length - 1; i >= 0; i--) {
      t += raw[i].data.length;
      if (t > max_bytes) {
        // it just went over the limit.  Everything before
        // and including the i-th message must be deleted.
        setIndex(i, "max_bytes");
        break;
      }
    }
  }

  return index;
}

export function enforceRateLimits({
  limits,
  bytesSent,
  subject,
  bytes,
}: {
  limits: { max_bytes_per_second: number; max_msgs_per_second: number };
  bytesSent: { [time: number]: number };
  subject?: string;
  bytes;
}) {
  const now = Date.now();
  if (!(limits.max_bytes_per_second > 0) && !(limits.max_msgs_per_second > 0)) {
    return;
  }

  const cutoff = now - 1000;
  let totalBytes = 0,
    msgs = 0;
  for (const t in bytesSent) {
    if (parseInt(t) < cutoff) {
      delete bytesSent[t];
    } else {
      totalBytes += bytesSent[t];
      msgs += 1;
    }
  }
  if (
    limits.max_bytes_per_second > 0 &&
    totalBytes + bytes > limits.max_bytes_per_second
  ) {
    const err = new PublishRejectError(
      `bytes per second limit of ${limits.max_bytes_per_second} exceeded`,
    );
    err.code = "REJECT";
    err.subject = subject;
    err.limit = "max_bytes_per_second";
    throw err;
  }
  if (limits.max_msgs_per_second > 0 && msgs > limits.max_msgs_per_second) {
    const err = new PublishRejectError(
      `messages per second limit of ${limits.max_msgs_per_second} exceeded`,
    );
    err.code = "REJECT";
    err.subject = subject;
    err.limit = "max_msgs_per_second";
    throw err;
  }
  bytesSent[now] = bytes;
}
