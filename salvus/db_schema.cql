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

    session_limit    int,   // how many simultaneous sage sessions the user can have
    storage_limit    int,   // total file space user can use
    max_session_time int,   // maximum time in minutes that a session can last
    ram_limit        int,   // maximum virtual ram usage in gigabytes per session

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
    email_user_changes boolean,
    email_maintenance  boolean,

    connect_Github     varchar,
    connect_Google     varchar,
    connect_Dropbox    varchar
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
