CREATE TABLE uuid_value (
     name varchar,
     uuid uuid,
     value varchar,
     PRIMARY KEY(name, uuid)
);

CREATE TABLE key_value (
     name varchar,
     key varchar,
     value varchar,
     PRIMARY KEY(name, key)
);

CREATE TABLE sage_servers (
    address varchar PRIMARY KEY,
    running boolean
);

CREATE INDEX ON sage_servers (running);

CREATE TABLE services (
    service_id uuid PRIMARY KEY,
    name varchar,
    address varchar,
    port int,
    running boolean,
    username varchar,
    pid int,
    monitor_pid int
);

CREATE INDEX ON services (running);

CREATE INDEX ON services (name);

CREATE TABLE status (
    service_id uuid,
    time timestamp,
    pmem float,
    pcpu float,
    cputime float,
    vsize int,
    rss int,
    PRIMARY KEY(service_id, time)
);

CREATE TABLE log (
    service_id uuid,
    time timestamp,
    logfile varchar,
    message varchar,
    PRIMARY KEY(service_id, time)
);

CREATE TABLE plans (
    plan_id          uuid PRIMARY KEY,
    current          boolean,          // whether or not this plan is currently active

    name             varchar,          // name of this plan
    description      varchar,          // text describing this plan

    price            varchar,          // JSON that describes price structure

    session_limit    int,   // how many simultaneous sessions the user can have
    storage_limit    int,   // total file space user can use
    max_session_time int,   // maximum time in minutes that a session can last
    ram_limit        int,   // maximum virtual ram usage in gigabytes per session
    support_level    varchar,   // you can pay for better support

    stateless_exec_limits varchar, // JSON {walltime:seconds, cputime:seconds, vmem:MB, numfiles:int, quota:MB}
);

CREATE INDEX ON plans(current)

// If you add columns to this table, also get_account in cassandra.coffee
// and account_settings_defaults in message.coffee.

CREATE TABLE accounts (
    account_id      uuid PRIMARY KEY,

    first_name      varchar,
    last_name       varchar,
    email_address   varchar,

    password_hash   varchar,
    password_change_wait_until  timestamp,

    plan_id         uuid,
    plan_starttime  timestamp,

    default_system  varchar,   // sage, python, octave, etc.
    evaluate_key    varchar,   // shift-enter, enter, control-enter

    email_new_features boolean,
    email_maintenance  boolean,

    connect_Github     varchar,
    connect_Google     varchar,
    connect_Dropbox    varchar,

    enable_tooltips    boolean

);

CREATE INDEX ON accounts(first_name);
CREATE INDEX ON accounts(last_name);
CREATE INDEX ON accounts(email_address);
CREATE INDEX ON accounts(plan_id);

CREATE TABLE account_log (
    account_id   uuid PRIMARY KEY,
    event        varchar,
    value        varchar
);

CREATE TABLE auths (
    account_id   uuid,
    provider     varchar,
    login_name   varchar,
    info         varchar,
    PRIMARY KEY(account_id, provider, login_name)
);


// the central log
CREATE TABLE central_log (
    time   timestamp PRIMARY KEY,
    event  varchar,
    value  varchar
)

CREATE INDEX ON central_log(event);

CREATE TABLE feedback (
    feedback_id uuid PRIMARY KEY,     // id of this feedback
    account_id uuid,      // user who reported the feedback (if known)
    category  varchar,      // 'bug', 'idea', 'comment'
    description varchar,  // description of feedback by user
    data    varchar,      // JSON object -- anything system wants to record about feedback, e.g., fields with state info (!)
    nps     int,          // "how likely are you to recommend salvus to one of your friends or colleagues" -- good time to ask: 0,1,..,9,10
    status  varchar,      // 'new' (user just reported it), 'issue' (opened ticket in feedback tracker), 'closed' (resolved), 'invalid'
    notes   varchar,      // notes by salvus developers about this issue
    url     varchar,      // pointer into feedback tracking system, if feedback is sent to a standard feedback tracker (e.g., a github issue)
    time    timestamp
);

CREATE INDEX ON feedback(account_id);   // so we can show (via GUI) all feedback issues associated with a given user to a user
CREATE INDEX ON feedback(category);
CREATE INDEX ON feedback(status);
CREATE INDEX ON feedback(nps);
CREATE INDEX ON feedback(time);


CREATE TABLE password_reset_attempts_by_ip_address (
     ip_address   varchar,
     time         timestamp,
     email_address varchar,
     PRIMARY KEY(ip_address, time)
);

CREATE TABLE password_reset_attempts_by_email_address (
     ip_address   varchar,
     time         timestamp,
     email_address varchar,
     PRIMARY KEY(email_address, time)
);

//////////////////////////////////////////
// sign in log
//////////////////////////////////////////
CREATE TABLE failed_sign_ins_by_ip_address (
     ip_address    varchar,
     time          timestamp,
     email_address varchar,
     PRIMARY KEY(ip_address, time)
);

CREATE TABLE failed_sign_ins_by_email_address (
     email_address varchar,
     time          timestamp,
     ip_address    varchar,
     PRIMARY KEY(email_address, time)
);

CREATE TABLE successful_sign_ins (
     account_id     uuid,
     time           timestamp,
     ip_address     varchar,
     signed_out     timestamp,
     remember_me    boolean,       // whether this login was accomplished via a remember_me cookie.
     email_address  varchar,       // for convenience
     first_name     varchar,       // for convenience
     last_name      varchar,       // for convenience
     PRIMARY KEY(account_id, time)
);



////////////////////////////////////////////
// Projects
////////////////////////////////////////////

CREATE TABLE projects (
     project_id       uuid  PRIMARY KEY,
     account_id       uuid,          // id of the owner of this project
     title            varchar,
     description      varchar,
     public           boolean,       // whether or not the project is visible to everybody in the world
     last_edited      timestamp,
     content          blob,          // binary data of the project, e.g., git bundle, etc.
);
CREATE INDEX ON projects(account_id);

CREATE TABLE project_users (
     project_id       uuid,
     account_id       uuid,
     mode             varchar,        // 'owner' (all powerful), 'collaborator' (read write), 'viewer' (read only)
     PRIMARY KEY (project_id, account_id)
);


////////////////////////////////////////////
// Sessions -- live compute sessions
////////////////////////////////////////////

CREATE TABLE sessions (
     session_id       uuid PRIMARY KEY,
     project_id       uuid,
     hub              varchar,    // "hostname:port" -- when hub restarted, admin deletes all these records
     server           varchar     // "hostname:port" -- server that session is running on
);
// there could be other metadata about the session, e.g., RAM limits, etc.

CREATE INDEX on sessions(project_id);
CREATE INDEX on sessions(hub);
CREATE INDEX on sessions(server);
