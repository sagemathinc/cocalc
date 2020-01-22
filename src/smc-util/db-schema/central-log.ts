import { create } from "./types";

export const central_log = create({
  fields: {
    id: {
      type: "uuid",
      desc: "Random id for this event"
    },
    event: {
      type: "string",
      desc: "Event name which must start with 'webapp-' to not conflict with other names that might be used already (e.g., by the backend)."
    },
    value: {
      type: "map",
      desc: "Any JSON-type data for this event"
    },
    time: {
      type: "timestamp",
      desc: "When the event took place"
    }
  },
  rules: {
    desc:
      "Table for logging system stuff that happens.  Meant for analytics, to help in running and understanding CoCalc better.  Not read by the frontend clients at all.",
    primary_key: "id",
    durability: "soft", // loss of some log data not serious, since used only for analytics
    pg_indexes: ["time", "event"],
    user_query: {
      set: {
        fields: {
          id: true,
          event: true,
          value: true,
          time: true
        },
        check_hook: (_db, query, _account_id, _project_id, cb): void => {
          if (!query.event.startsWith("webapp-")) {
            cb("event must start with 'webapp-'");
          } else {
            cb();
          }
        }
      }
    }
  }
});
