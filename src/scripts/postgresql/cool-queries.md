How many patches in the last hour?

    select count(*) from patches where time >= now()-interval '60 min';

Recently created accounts:

    select NOW() - created, first_name, last_name, email_address from accounts where created is not null order by created desc limit 100;

Recently created accounts from gmail.com

    select created, first_name, last_name, email_address from accounts where created is not null and email_address LIKE '%gmail.com%' order by created desc limit 10;

Active projects:

    select NOW() - last_edited as when, left(title,35) as title, project_id from projects where last_edited is not null order by last_edited desc limit 100;

Uncaught exceptions that got reported to the DB (so from storage, hubs, etc.):

    select NOW() - time, event, value from central_log where event = 'uncaught_exception' order by time desc limit 10;

Problems people are having right now:

    smc=# select NOW() - time, error from client_error_log order by time desc limit 100;

The syncstring (hence project_id, etc.) for a file with a given path somewhere... (you'll see this in the problems).  This can be kind of slow since there is no index.

    smc=# select * from syncstrings where path='2017-01-29-135641.sagews';

or for really common paths:

    select * from syncstrings where path='Homework 1.tex' and last_active is not null order by last_active desc limit 10;

Find active sage worksheets:

    select * from syncstrings where path like '%.sagews' and last_active is not null order by last_active desc limit 10;

Active syncstrings:

    select string_id, project_id, left(path,50) as path, NOW()-last_active from syncstrings where last_active is not null order by last_active desc limit 20;

