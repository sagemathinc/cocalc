CREATE TABLE uuid_blob (
     name varchar,
     uuid uuid,
     value blob,
     PRIMARY KEY(name, uuid)
);

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

CREATE TABLE compute_servers (
    dummy boolean,
    host varchar,
    running boolean,
    score int,
    PRIMARY KEY(dummy, host)
);
CREATE INDEX ON compute_servers (running);

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
    gitconfig       varchar,   // if empty or undefined, make simple default from first_name, last_name, email_address.

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

    autosave           int,
    terminal           varchar, // JSON

    editor_settings    varchar, // JSON

    enable_tooltips    boolean

    owner                set<uuid>,   // projects that this user owns
    collaborator         set<uuid>,   // projects this users is collaborating on
    invited_collaborator set<uuid>,   // projects this user has been invited to collaborate on (but has not accepted)
    viewer               set<uuid>,   // projects this user can view (but not change)
    invited_viewer       set<uuid>    // projects this user has been invited to view (but has not accepted)

);

CREATE TABLE email_address_to_account_id (
    email_address varchar PRIMARY KEY,
    account_id    uuid
);

CREATE INDEX ON accounts(email_address);  /* this is horrible and should not be used or exist */

/* these indexes are for command line convenience and use only: */
CREATE INDEX ON accounts(first_name);
CREATE INDEX ON accounts(last_name);
CREATE INDEX ON accounts(plan_id);

CREATE TABLE account_log (
    account_id   uuid PRIMARY KEY,
    event        varchar,
    value        varchar
);


/* If an account is created with the given email address, then the
   given set of actions (given by JSON strings) are all taken.
   For example, one action is {'action':'add_to_project', 'group':'collaborator', 'project_id':'xxx'}
   */
CREATE TABLE account_creation_actions (
    email_address varchar PRIMARY KEY,
    actions set<varchar>
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
// Projects -- see the appropriate section
// of message.coffee for how projects work.
////////////////////////////////////////////

CREATE TABLE projects (
     project_id       uuid  PRIMARY KEY,
     account_id       uuid,          // id of original creator of this project
     title            varchar,
     description      varchar,
     public           boolean,   // whether or not the project is visible to everybody in the world
     snapshots_disabled boolean, // if true, do not make snapshots (e.g., because something is weird)

     last_edited      timestamp,// timestamp of last modification of the project

     location         varchar,  // the username@host on which deployed: JSON -- {username:, host:, port:, path:}
     quota            varchar,  // JSON

     backup           varchar,  // hosts on which files are backed up (via rsnapshot): JSON format not yet determined

     size             int,      // total size in bytes at last save
     deleted          boolean,  // if true, user deleted the project, so nobody sees it.

     owner                set<uuid>,   // owners of this project (will have some special perms)
     collaborator         set<uuid>,   // all actual collaborators on this project
     invited_collaborator set<uuid>,   // accounts that have been invited to collaborate
     viewer               set<uuid>,   // accounts who are viewers
     invited_viewer       set<uuid>    // accounts who have been invited to view.

);

/* no real reason to use this -- since all projects owned by a given user isn't really interesting --
   users want all projects they collab on in some way. */
CREATE INDEX ON projects(account_id);

CREATE INDEX ON projects(snapshots_disabled);  /* rare lookup */
CREATE INDEX ON projects(location);   /* rare lookup -- mainly used for manually checking on weirdness... */

CREATE TABLE project_users (
     project_id       uuid,
     account_id       uuid,
     mode             varchar,        // 'owner' (all powerful), 'collaborator' (read/write), 'viewer' (read only)
     state            varchar,        // 'invited', 'accepted'
     PRIMARY KEY (project_id, account_id)
);

/* Example: update project_users set mode='collaborator', state='accepted' where project_id=06ec6722-7ecd-410d-b5da-cdb9bfa09a51 and account_id=25e2cae4-05c7-4c28-ae22-1e6d3d2e8bb5 ;
*/
/* Table of persistent blobs attached to a project. */
CREATE TABLE project_blobs (
     blob_id     uuid,
     project_id  uuid,
     PRIMARY KEY(blob_id)
);
CREATE INDEX ON project_blobs(project_id);

/* Whenever a project is touched, we also add it to this table with a ttl. */
CREATE TABLE recently_modified_projects (
    ttl        varchar,   /* 'short', 'day', 'week', 'month'  */
    project_id uuid,
    dummy      boolean,
    PRIMARY KEY(ttl, project_id)
);



////////////////////////////////////////////
// Hubs -- the global hubs that coordinate users with resources
////////////////////////////////////////////

/* The hub servers -- entries in this table should always be inserted with a
   small ttl (e.g., 30 seconds) that is periodically updated. */


CREATE TABLE hub_servers (
    dummy      boolean,    /* so fast */
    host       varchar,    /* hostname (ip address) */
    port       int,
    clients    int,        /* total number of connected clients right now */
    PRIMARY KEY(dummy, host, port)
);


////////////////////////////////////////////
// Snap -- the project snapshot servers
////////////////////////////////////////////

/* The snap servers -- entries in this table should always be inserted with a
   very small ttl (e.g., 15 seconds); the entry then gets periodically updated. */
CREATE TABLE snap_servers (
    dummy      boolean,   /* so all stored in same place, so "select *" query is instance instead of 10 seconds! */
    id         uuid,
    host       varchar,    /* hostname */
    port       int,        /* integer port */
    key        varchar,    /* random string needed to unlock tcp connection */
    size       int,        /* total size in kilobytes of the objects/pack directory of the archive */
    PRIMARY KEY(dummy, id)
);


CREATE TABLE snap_commits (
    server_id  uuid,       /* id into snap_servers table above */
    project_id uuid,       /* id of the project */
    timestamp  varchar,    /* date of commit, in the bup string format */
    utc_seconds_epoch int, /* timestamp of commit in seconds since the epoch in UTC time */
    size       int,        /* size in kilobytes that making this snapshot increased the total size of the bup archive */
    repo_id    uuid,       /* id of the bup repo that contains this snapshot */
    modified_files varchar, /* JSON list of strings of the paths of the files that were modified in this commit. */
    PRIMARY KEY(server_id, project_id, timestamp)
);


/* Basically this is the most recent entry per server in snap_commits above, but
   designed to provide easy access based on the project_id.
   To use this, client queries table based on project_id, then takes the
   entries such that the given server is up, and sorts by timestamp.
   This is mainly useful for recovering or moving projects.  */
CREATE TABLE last_snapshot (
    project_id uuid,
    server_id  uuid,
    repo_id    uuid,
    timestamp  varchar,
    utc_seconds_epoch int,
    PRIMARY KEY(project_id, server_id)
);



/* This would be very slow... but note that we do not do this query during any normal website ops.
   This is something that was just meant for maybe offline stuff... */
CREATE INDEX ON snap_commits(repo_id);

CREATE TABLE snap_modified_files (
    project_id uuid,
    filename   varchar,
    timestamp  varchar,
    dummy      boolean,
    PRIMARY KEY(project_id, filename, timestamp)
);



/* snap_ls_cache entries should always be inserted with a ttl (e.g., a few days) */
CREATE TABLE snap_ls_cache (
    project_id uuid,       /* id of the project */
    timestamp  varchar,    /* date of commit, in the bup string format */
    path       varchar,    /* path into the commit */
    listing    varchar,    /* JSON */
    PRIMARY KEY(project_id, timestamp, path)
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






////////////////////////////////////////////
// Admin -- log of events
////////////////////////////////////////////

CREATE TABLE admin_log (
    service varchar,
    time timestamp,
    message varchar,
    PRIMARY KEY(service, time)
);



////////////////////
// Server stats
///////////////////

CREATE TABLE stats (
    time timestamp PRIMARY KEY,
    timestamp varchar,
    accounts int,
    projects int,
    active_projects int,
    last_day_projects int,
    last_week_projects int,
    last_month_projects int,
    snap_servers int,
    hub_servers varchar /* JSON */
);

CREATE TABLE stats_cache (
    dummy    boolean PRIMARY KEY,
    timestamp varchar,
    accounts int,
    projects int,
    active_projects int,
    last_day_projects int,
    last_week_projects int,
    last_month_projects int,
    snap_servers int,
    hub_servers varchar /* JSON */
);

CREATE TABLE counts (
    table_name varchar PRIMARY KEY,
    count counter  /* see http://www.datastax.com/documentation/cql/3.0/webhelp/cql/cql_using/use_counter_t.html */
);


CREATE TABLE monitor (
    day varchar,
    hour int,
    minute int,

    timestamp int,  /* seconds since epoch */
    dns varchar,   /* JSON */
    load varchar,  /* JSON */
    snap varchar,  /* JSON */
    cassandra varchar,  /* JSON */
    compute varchar,    /* JSON */

    PRIMARY KEY(day, hour, minute)
);

CREATE TABLE monitor_last (
    dummy boolean  PRIMARY KEY,

    day varchar,
    hour int,
    minute int,
    timestamp int,  /* UTC seconds since epoch */
    dns varchar,   /* JSON */
    load varchar,  /* JSON */
    snap varchar,  /* JSON */
    cassandra varchar,  /* JSON */
    compute varchar    /* JSON */

);



CREATE TABLE file_access_log (
    day        varchar,
    timestamp  timestamp,
    account_id uuid,
    project_id uuid,
    filename   varchar,
    PRIMARY KEY(day, timestamp, account_id, project_id)
);


