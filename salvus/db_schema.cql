/*

CREATE KEYSPACE salvus WITH replication = {  'class': 'NetworkTopologyStrategy',  'DC0': '1' };

CREATE KEYSPACE salvus WITH replication = {'class': 'NetworkTopologyStrategy', 'DC5': '3', 'DC6': '3'}  AND durable_writes = true;

or


GRANT SELECT ON table storage_servers TO monitor;
GRANT MODIFY ON table storage_servers TO monitor;


CREATE KEYSPACE system_auth WITH replication = {'class': 'NetworkTopologyStrategy', 'DC5': '3', 'DC6': '3'}  AND durable_writes = true;


ALTER KEYSPACE system_auth WITH REPLICATION = {'class': 'NetworkTopologyStrategy', 'DC5': '3', 'DC6': '3'} ;



ALTER KEYSPACE salvus WITH REPLICATION = {'class': 'NetworkTopologyStrategy', 'us-central1':'3', 'europe-west1':'3'};
ALTER KEYSPACE system_auth WITH REPLICATION = {'class': 'NetworkTopologyStrategy', 'us-central1':'3', 'europe-west1':'3'} ;

*/

/* NOTE: as explained at db_schema.cql
   these blob tables below will store everything with a given name in the *same* single Cassandra column, hence not spread across
   the cluster.  This is technically bad (though in practice can maybe mean some queries are faster).  It's mainly an issue if the
   size of the table were huge, which it isn't now.   This must be restructured at some point though.
*/

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

CREATE TABLE passport_settings (
    strategy varchar PRIMARY KEY,
    conf     map<varchar, varchar>
);

/* If you add columns to this table, also may need to update get_account in cassandra.coffee
   and account_settings_defaults in message.coffee. */

CREATE TABLE accounts (
    account_id           uuid PRIMARY KEY,
    created              timestamp,

    first_name           varchar,
    last_name            varchar,
    email_address        varchar,
    gitconfig            varchar,   /* if empty or undefined, make simple default from first_name, last_name, email_address. */

    password_hash        varchar,
    password_change_wait_until  timestamp,

    plan_id              uuid,
    plan_starttime       timestamp,

    default_system       varchar,   /* sage, python, octave, etc. */
    evaluate_key         varchar,   /* shift-enter, enter, control-enter */

    email_new_features   boolean,
    email_maintenance    boolean,

    autosave             int,
    terminal             varchar, /* JSON */

    editor_settings      varchar, /* JSON */

    other_settings       varchar, /* JSON */

    enable_tooltips      boolean,

    owner                set<uuid>,   /* projects that this user owns                                                  */
    collaborator         set<uuid>,   /* projects this users is collaborating on                                       */
    invited_collaborator set<uuid>,   /* projects this user has been invited to collaborate on (but has not accepted)  */
    viewer               set<uuid>,   /* projects this user can view (but not change)                                  */
    invited_viewer       set<uuid>,   /* projects this user has been invited to view (but has not accepted)            */

    hidden_projects      set<uuid>,   /* projects that this user doesn't normally see by default (e.g., all students in their course) */

    groups               set<varchar>,  /* groups that this account is a member of; e.g., 'admin', which grants extreme power */

    notifications_syncdb uuid,
    /* syncdbs              map<varchar:uuid>, */ /* synchronized databases that user has access to */

    /* current remember_me cookies for this users: we use this to
       delete=revoke all of them when the user changes their password. */
    remember_me          set<varchar>,

    /* The stripe customer id, if this user has setup a billing account at stripe. */
    stripe_customer_id   varchar,

    /* Map from passport logins for this account to their auth-provided id.  The raw
       profile information is stored in the passports table defined below. */
    passports            map<varchar, varchar>
);

CREATE TABLE email_address_to_account_id (
    email_address varchar PRIMARY KEY,
    account_id    uuid
);

CREATE TABLE passports (
    id         varchar,
    strategy   varchar,
    account_id uuid,
    profile    varchar,   /* raw user profile that we got from the authentication provider */
    PRIMARY KEY(id, strategy)  /* id is first so it is the cluster key, so data more smoothly distributed, rather than grouped by strategy */
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


/* the central log */
CREATE TABLE central_log (
    time   timestamp PRIMARY KEY,
    event  varchar,
    value  varchar
);

CREATE INDEX ON central_log(event);

CREATE TABLE feedback (
    feedback_id uuid PRIMARY KEY,   /* id of this feedback */
    account_id uuid,                /* user who reported the feedback (if known) */
    category  varchar,              /* 'bug', 'idea', 'comment' */
    description varchar,            /* description of feedback by user */
    data    varchar,                /* JSON object -- anything system wants to record about feedback, e.g., fields with state info (!) */
    nps     int,                    /* "how likely are you to recommend salvus to one of your friends or colleagues" -- good time to ask: 0,1,..,9,10 */
    status  varchar,                /* 'new' (user just reported it), 'issue' (opened ticket in feedback tracker), 'closed' (resolved), 'invalid' */
    notes   varchar,                /* notes by salvus developers about this issue */
    url     varchar,                /* pointer into feedback tracking system, if feedback is sent to a standard feedback tracker (e.g., a github issue) */
    time    timestamp
);

CREATE INDEX ON feedback(account_id);   /* so we can show (via GUI) all feedback issues associated with a given user to a user */
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

/* sign in log */
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



/*
   Projects -- see the appropriate section
   of message.coffee for how projects work.
   */

CREATE TABLE projects (
     project_id       uuid  PRIMARY KEY,
     created          timestamp,

     account_id       uuid,          /* id of original creator of this project */
     title            varchar,
     description      varchar,
     public           boolean,       /* whether or not the project is visible to everybody in the world - TODO: NOT USED CURRENTLY */
     snapshots_disabled boolean,     /* if true, do not make snapshots (e.g., because something is weird) */

     last_edited      timestamp,     /* timestamp of last modification of the project */

     compute_server   varchar,        /* hostname of compute server where this project is opened */
     compute_server_assigned timestamp,   /* when project was opened on this compute server (used as check for automatic failover) */

     /* bup = deprecated */
     bup_location     uuid,         /* location using new bup-based storage system */
     bup_last_save    map<uuid, timestamp>,
     bup_repo_size_kb     int,      /* last known size of bup repository in kilobytes = 1000 bytes */
     bup_working_size_kb  int,      /* last known size of working directory in kilobytes = 1000 bytes */


     settings         map<text,text>,  /* various project settings, e.g., 'memory', 'cpu_shares', 'cores', 'disk', 'mintime', 'login_shell' */

     size             int,      /* total size in bytes at last save */
     deleted          boolean,  /* if true, user deleted the project, so nobody sees it. */

     owner                set<uuid>,   /* owners of this project (will have some special perms) */
     collaborator         set<uuid>,   /* all actual collaborators on this project              */
     invited_collaborator set<uuid>,   /* accounts that have been invited to collaborate        */
     viewer               set<uuid>,   /* accounts who are viewers                              */
     invited_viewer       set<uuid>,   /* accounts who have been invited to view.               */

     hide_from_accounts   set<uuid>,   /* accounts from which this project is hidden, e.g., all students in a course */

     abuser varchar,

     task_list_id     uuid,            /* TODO-- remove; not used -- top-level task list for this project */

     /* stripe subscriptions that we think should apply to this project -- set of stripe subscription id's */
     stripe_subscriptions   set<varchar>
);

/* no real reason to use this -- since all projects owned by a given user isn't really interesting --
   users want all projects they collab on in some way. */
CREATE INDEX ON projects(account_id);

CREATE INDEX ON projects(snapshots_disabled);  /* rare lookup */

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


/* public shared documents/paths */
CREATE TABLE public_paths (
    project_id  uuid,
    path        varchar,
    description varchar,
    PRIMARY KEY(project_id, path)
);


/* Hubs -- the global hubs that coordinate users with resources */

/* The hub servers -- entries in this table should always be inserted with a
   small ttl (e.g., 30 seconds) that is periodically updated. */


CREATE TABLE hub_servers (
    dummy      boolean,    /* so fast */
    host       varchar,    /* hostname (ip address) */
    port       int,
    clients    int,        /* total number of connected clients right now */
    PRIMARY KEY(dummy, host, port)
);




/* Admin -- log of events */

CREATE TABLE admin_log (
    service varchar,
    time timestamp,
    message varchar,
    PRIMARY KEY(service, time)
);

CREATE TABLE client_error_log (
    type        varchar,
    timestamp   timestamp,
    account_id  uuid,
    error       varchar,
    PRIMARY KEY(type, timestamp)
);

/* Record of and notifications about activity on specific paths */

/* the 2 is because I messed up a previous schema */
CREATE TABLE activity_by_project2 (
   project_id  uuid,
   timestamp   timestamp,
   path        varchar,
   account_id  uuid,
   action      varchar,  /* edit, comment, create, delete */
   seen_by     set<uuid>,
   read_by     set<uuid>,
   PRIMARY KEY (project_id, timestamp, path)
);

CREATE TABLE recent_activity_by_project2 (
   project_id  uuid,
   timestamp   timestamp,
   path        varchar,
   account_id  uuid,
   action      varchar,
   seen_by     set<uuid>,
   read_by     set<uuid>,
   PRIMARY KEY (project_id, timestamp, path)
);


CREATE TABLE activity_by_path (
   project_id  uuid,
   path        varchar,
   timestamp   timestamp,
   account_id  uuid,
   PRIMARY KEY (project_id, path, timestamp)
);

CREATE TABLE activity_by_user (
   account_id  uuid,
   timestamp   timestamp,
   project_id  uuid,
   path        varchar,
   project_title varchar,
   PRIMARY KEY (account_id, timestamp)
);

/* Database-backed synchronized strings */

CREATE TABLE syncstrings (
    string_id  uuid,
    timestamp  timestamp,
    patch      varchar,
    is_first   boolean,
    PRIMARY KEY (string_id, timestamp)
);

CREATE TABLE syncstring_acls (
    string_id  uuid  PRIMARY KEY,
    acl        map<uuid,varchar>     /* account_id:'write', account2_id:'read' */
);

CREATE TABLE syncstring_servers (
    dummy      boolean,    /* so fast to query for a list of all -- only have to hit 2 machines, not all */
    host       varchar,    /* hostname (ip address) */
    port       int,
    secret_token varchar,
    PRIMARY KEY (dummy, host, port)
);

/* Server stats */

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



CREATE TABLE storage_topology (
    data_center  varchar,
    host         varchar,
    vnodes       int,
    disabled     boolean,  /* if true, don't open projects here, etc., even if machine is on --- use for maintenance */
    PRIMARY KEY (data_center, host)
);

/* Table of email addresses that are not allowed.  If a user tries to register with
   foo+bar@xyz.com and foo@xyz.com is in this table, then they are not allowed to
   create an account.
   When a user connects, if their normalized address is in this table, then they
   are rejected.

   UPDATE banned_email_addresses set dummy=true where email_address='khandebazaar@gmail.com';
*/

CREATE TABLE banned_email_addresses (
    email_address varchar PRIMARY KEY,
    dummy         boolean
);

/* storage_servers = deprecated part of bup_server stuff. */
CREATE TABLE storage_servers (
    dummy         boolean,
    server_id     uuid,
    host          inet,
    port          int,
    dc            int,
    health        float,
    secret        varchar,
    experimental  boolean,      /* if true ignored this host when assigning hosts for a new project */
    ssh           map<int, varchar>,   /*  dc -> 'address:port' when connecting *from* that dc; use dc=-1 for connecting from the greater internet */
    PRIMARY KEY(dummy, server_id)
);



CREATE TABLE compute_servers (
    host          varchar PRIMARY KEY,
    port          int,
    dc            varchar,
    health        float,
    secret        varchar,
    experimental  boolean,             /* if true ignored this host when assigning hosts for a project */
);


/* Billing */





