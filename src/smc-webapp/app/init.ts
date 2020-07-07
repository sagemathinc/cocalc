import { init_actions } from "./actions";
import { init_store } from "./store";
import { init_ping } from "./monitor-pings";
import { init_connection } from "./monitor-connection";
import { init_query_params } from "./query-params";

init_actions();
init_store();
init_ping();
init_connection();
init_query_params();
