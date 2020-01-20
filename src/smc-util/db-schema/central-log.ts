import { create } from "./types";

export const central_log = create({
  fields: {
    id: {
      type: "uuid",
      desc: "generic id for this event"
    },
    event: {
      type: "string",
      desc: "any even name which should not conflict with other names"
    },
    value: {
      type: "map",
      desc: "Any json type data for this event"
    },
    time: {
      type: "timestamp",
      desc: "When the event took place"
    }
  },
  rules: {
    desc:
      "Table for logging system stuff that happens.  Meant to help in running and understanding the system better.",
    primary_key: "id",
    durability: "soft", // loss of some log data not serious, since used only for analytics
    pg_indexes: ["time", "event"],
    user_query: {
      set: {
        fields: {
          id: null,
          event: null,
          value: null,
          time: null
        },
        before_change: (_database, _old_val, new_val) => {
          new_val.event = "webapp " + new_val.event;
        }
      }
    }
  }
});
