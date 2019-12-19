import { create } from "./types";

export const abtest = create({
  fields: {
    test_name: {
      type: "string",
      desc: "Name of the A/B Test this event is relevant to"
    },
    account_id: {
      type: "uuid",
      desc: "The uuid that determines the user account"
    },
    events: {
      type: "map",
      desc: "{Timestamp: Data relevant to this A/B Test}"
    },
    time: {
      type: "timestamp",
      desc: "last touch time"
    }
  },
  rules: {
    desc: "Events from ab-tests",
    primary_key: ["account_id", "test_name"],
    db_standby: "unsafe",
    durability: "soft", // loss of some log data not serious, since used only for analytics

    user_query: {
      get: {
        admin: true,
        pg_where: ["time >= NOW() - interval '14 days'"],
        fields: {
          account_id: null,
          test_name: null,
          time: null,
          events: null
        }
      },
      set: {
        fields: {
          account_id: true,
          test_name: true,
          time: true,
          events: true
        }
      }
    }
  }
});
