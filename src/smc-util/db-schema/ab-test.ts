import { create } from "./types";

export const abtest = create({
  fields: {
    test_name: {
      type: "string",
      desc: "Name of the A/B Test this event is relevant to"
    },
    time: {
      type: "timestamp",
      desc: "when this event happened"
    },
    payload: {
      type: "map",
      desc: "Data relevant to this A/B Test"
    },
    account_id: {
      type: "uuid",
      desc: "The uuid that determines the user account"
    }
  },
  rules: {
    desc: "Events from ab-tests",
    primary_key: ["account_id", "time", "test_name"],
    db_standby: "unsafe",

    user_query: {
      get: {
        fields: {
          test_name: null,
          time: null,
          payload: null
        }
      }
    }
  }
});
