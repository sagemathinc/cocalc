// TODO this shouldn't be redefined here -- use  project's sage_session::SageSessionType
// Instead, this is implemented via that class, such that everything stays consistent with the sync package.
export interface ISageSession {
  close: () => void;
  is_running: () => boolean;
  init_socket: () => Promise<void>;
  call: (obj: { input: object; cb: Function }) => Promise<void>;
}
