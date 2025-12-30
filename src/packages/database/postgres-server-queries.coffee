#########################################################################
# This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
# License: MS-RSL – see LICENSE.md for details
#########################################################################

###
PostgreSQL -- implementation of all the queries needed for the backend servers

These are all the non-reactive non-push queries, e.g., adding entries to logs,
checking on cookies, creating accounts and projects, etc.

COPYRIGHT : (c) 2017 SageMath, Inc.
LICENSE   : MS-RSL
###

# limit for async.map or async.paralleLimit, esp. to avoid high concurrency when querying in parallel
MAP_LIMIT = 5

async   = require('async')

random_key = require("random-key")

misc_node = require('@cocalc/backend/misc_node')
misc2_node = require('@cocalc/backend/misc')

{defaults} = misc = require('@cocalc/util/misc')
required = defaults.required

# IDK why, but if that import line is down below, where the other "./postgres/*" imports are, building manage
# fails with: remember-me.ts(15,31): error TS2307: Cannot find module 'async-await-utils/hof' or its corresponding type declarations.
{get_remember_me_message, invalidate_all_remember_me, delete_remember_me} = require('./postgres/remember-me')
{change_password, reset_password, set_password_reset, get_password_reset, delete_password_reset, record_password_reset_attempt, count_password_reset_attempts} = require('./postgres/password')
{getCouponHistory, updateCouponHistory, accountIdsToUsernames} = require('./postgres/coupon-and-username')
{setProjectStorageRequest, getProjectStorageRequest, setProjectState, getProjectState} = require('./postgres/project-state')

{SCHEMA, DEFAULT_QUOTAS, PROJECT_UPGRADES, COMPUTE_STATES, RECENT_TIMES, RECENT_TIMES_KEY, site_settings_conf} = require('@cocalc/util/schema')

{ quota } = require("@cocalc/util/upgrades/quota")

PROJECT_GROUPS = misc.PROJECT_GROUPS

{PROJECT_COLUMNS, one_result, all_results, count_result, expire_time} = require('./postgres-base')

# TODO is set_account_info_if_possible used here?!
{is_paying_customer, set_account_info_if_possible} = require('./postgres/account-queries')
{getStripeCustomerId, syncCustomer} = require('./postgres/stripe')

{site_license_usage_stats, projects_using_site_license, number_of_projects_using_site_license} = require('./postgres/site-license/analytics')
{update_site_license_usage_log} = require('./postgres/site-license/usage-log')
{site_license_public_info} = require('./postgres/site-license/public')
{site_license_manager_set} = require('./postgres/site-license/manager')
{matching_site_licenses, manager_site_licenses} = require('./postgres/site-license/search')
{project_datastore_set, project_datastore_get, project_datastore_del, get_collaborator_ids, get_collaborators, get_project_ids_with_user, get_account_ids_using_project, user_is_in_project_group, user_is_collaborator, recently_modified_projects, get_open_unused_projects, get_project, _get_project_column, get_user_column} = require('./postgres/project-queries')
{permanently_unlink_all_deleted_projects_of_user, unlink_old_deleted_projects} = require('./postgres/delete-projects')
{get_all_public_paths, unlist_all_public_paths, get_public_paths, has_public_path, path_is_public, filter_public_paths} = require('./postgres/public-paths')
{get_personal_user} = require('./postgres/personal')
{set_passport_settings, get_passport_settings, get_all_passport_settings, get_all_passport_settings_cached, create_passport, passport_exists, update_account_and_passport, _passport_key} = require('./postgres/passport')
{projects_that_need_to_be_started} = require('./postgres/always-running');
{calc_stats} = require('./postgres/stats')
{getServerSettings, resetServerSettingsCache, getPassportsCached, setPassportsCached} = require('@cocalc/database/settings/server-settings');
{pii_expire} = require("./postgres/pii")
registrationTokens = require('./postgres/registration-tokens').default;
{updateUnreadMessageCount} = require('./postgres/messages');
centralLog = require('./postgres/central-log').default;
{get_log, get_user_log, uncaught_exception, log_client_error, webapp_error, get_client_error_log} = require('./postgres/log-query');
{set_server_setting, get_server_setting, get_server_settings_cached, get_site_settings, server_settings_synctable, reset_server_settings_cache} = require('./postgres/server-settings');
{log_file_access, get_file_access, record_file_use, get_file_use} = require('./postgres/file-access');
{register_hub, get_hub_servers} = require('./postgres/hub-management');
{get_stats_interval, get_active_student_stats} = require('./postgres/statistics');
{is_admin, user_is_in_group, account_exists} = require('./postgres/account-basic');
{get_account, is_banned_user, accountWhere} = require('./postgres/account-core');
{make_user_admin, count_accounts_created_by, touchAccount} = require('./postgres/account-management');
{touchProjectInternal, touchProject, touch} = require('./postgres/activity');

stripe_name = require('@cocalc/util/stripe/name').default;


exports.extend_PostgreSQL = (ext) -> class PostgreSQL extends ext
    # write an event to the central_log table
    log: (opts) =>
        opts = defaults opts,
            event : required    # string
            value : required    # object
            cb    : undefined
        try
            await centralLog(opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    uncaught_exception: (err) =>
        return await uncaught_exception(@, err)

    # dump a range of data from the central_log table
    get_log: (opts) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            log   : 'central_log' # which table to query
            event : undefined
            where : undefined     # if given, restrict to records with the given json
                                  # containment, e.g., {account_id:'...'}, only returns
                                  # entries whose value has the given account_id.
            cb    : required
        try
            result = await get_log(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # Return every entry x in central_log in the given period of time for
    # which x.event==event and x.value.account_id == account_id.
    get_user_log: (opts) =>
        opts = defaults opts,
            start      : undefined
            end        : undefined     # if not given include everything until now
            event      : 'successful_sign_in'
            account_id : required
            cb         : required
        try
            result = await get_user_log(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    log_client_error: (opts) =>
        opts = defaults opts,
            event      : 'event'
            error      : 'error'
            account_id : undefined
            cb         : undefined
        try
            await log_client_error(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    webapp_error: (opts) =>
        opts = defaults opts,
            account_id   : undefined
            name         : undefined
            message      : undefined
            comment      : undefined
            stacktrace   : undefined
            file         : undefined
            path         : undefined
            lineNumber   : undefined
            columnNumber : undefined
            severity     : undefined
            browser      : undefined
            mobile       : undefined
            responsive   : undefined
            user_agent   : undefined
            smc_version  : undefined
            build_date   : undefined
            smc_git_rev  : undefined
            uptime       : undefined
            start_time   : undefined
            id           : undefined  # ignored
            cb           : undefined
        try
            await webapp_error(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    get_client_error_log: (opts) =>
        opts = defaults opts,
            start : undefined     # if not given start at beginning of time
            end   : undefined     # if not given include everything until now
            event : undefined
            cb    : required
        try
            result = await get_client_error_log(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    set_server_setting: (opts) =>
        opts = defaults opts,
            name     : required
            value    : required
            readonly : undefined  # boolean. if yes, that value is not controlled via any UI
            cb       : required
        try
            await set_server_setting(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    reset_server_settings_cache: =>
        reset_server_settings_cache()

    get_server_setting: (opts) =>
        opts = defaults opts,
            name  : required
            cb    : required
        try
            result = await get_server_setting(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    get_server_settings_cached: (opts) =>
        opts = defaults opts,
            cb: required
        try
            result = await get_server_settings_cached()
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    get_site_settings: (opts) =>
        opts = defaults opts,
            cb : required   # (err, settings)
        try
            result = await get_site_settings(@)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    server_settings_synctable: (opts={}) =>
        return server_settings_synctable(@, opts)

    set_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
            conf     : required
            info     : undefined
            cb       : required
        return await set_passport_settings(@, opts)

    get_passport_settings: (opts) =>
        opts = defaults opts,
            strategy : required
        return await get_passport_settings(@, opts)

    get_all_passport_settings: () =>
        return await get_all_passport_settings(@)

    get_all_passport_settings_cached: () =>
        return await get_all_passport_settings_cached(@)

    create_passport: (opts) =>
        return await create_passport(@, opts)

    passport_exists: (opts) =>
        return await passport_exists(@, opts)

    update_account_and_passport: (opts) =>
        return await update_account_and_passport(@, opts)

    ###
    Creating an account using SSO only.
    This needs to be rewritten in @cocalc/server like
    all the other account creation.  This is horrible
    because
    ###
    create_sso_account: (opts={}) =>
        opts = defaults opts,
            first_name        : undefined
            last_name         : undefined

            created_by        : undefined  #  ip address of computer creating this account

            email_address     : undefined
            password_hash     : undefined
            lti_id            : undefined  # 2-tuple <string[]>[iss, user_id]

            passport_strategy : undefined
            passport_id       : undefined
            passport_profile  : undefined
            usage_intent      : undefined
            cb                : required       # cb(err, account_id)

        dbg = @_dbg("create_sso_account(#{opts.first_name}, #{opts.last_name}, #{opts.lti_id}, #{opts.email_address}, #{opts.passport_strategy}, #{opts.passport_id}), #{opts.usage_intent}")
        dbg()

        for name in ['first_name', 'last_name']
            if opts[name]
                test = misc2_node.is_valid_username(opts[name])
                if test?
                    opts.cb("#{name} not valid: #{test}")
                    return

        if opts.email_address # canonicalize the email address, if given
            opts.email_address = misc.lower_email_address(opts.email_address)

        account_id = misc.uuid()

        passport_key = undefined
        if opts.passport_strategy?
            # This is to make it impossible to accidentally create two accounts with the same passport
            # due to calling create_account twice at once.   See TODO below about changing schema.
            # This should be enough for now since a given user only makes their account through a single
            # server via the persistent websocket...
            @_create_account_passport_keys ?= {}
            passport_key = _passport_key(strategy:opts.passport_strategy, id:opts.passport_id)
            last = @_create_account_passport_keys[passport_key]
            if last? and new Date() - last <= 60*1000
                opts.cb("recent attempt to make account with this passport strategy")
                return
            @_create_account_passport_keys[passport_key] = new Date()

        async.series([
            (cb) =>
                if not opts.passport_strategy?
                    cb(); return
                dbg("verify that no account with passport (strategy='#{opts.passport_strategy}', id='#{opts.passport_id}') already exists")
                # **TODO:** need to make it so insertion into the table still would yield an error due to
                # unique constraint; this will require probably moving the passports
                # object to a separate table.  This is important, since this is exactly the place where
                # a race condition might cause trouble!
                @passport_exists
                    strategy : opts.passport_strategy
                    id       : opts.passport_id
                    cb       : (err, account_id) ->
                        if err
                            cb(err)
                        else if account_id
                            cb("account with email passport strategy '#{opts.passport_strategy}' and id '#{opts.passport_id}' already exists")
                        else
                            cb()
            (cb) =>
                dbg("create the actual account")
                @_query
                    query  : "INSERT INTO accounts"
                    values :
                        'account_id     :: UUID'      : account_id
                        'first_name     :: TEXT'      : opts.first_name
                        'last_name      :: TEXT'      : opts.last_name
                        'lti_id         :: TEXT[]'    : opts.lti_id
                        'created        :: TIMESTAMP' : new Date()
                        'created_by     :: INET'      : opts.created_by
                        'password_hash  :: CHAR(173)' : opts.password_hash
                        'email_address  :: TEXT'      : opts.email_address
                        'sign_up_usage_intent :: TEXT': opts.usage_intent
                    cb : cb
            (cb) =>
                if opts.passport_strategy?
                    dbg("add passport authentication strategy")
                    @create_passport
                        account_id : account_id
                        strategy   : opts.passport_strategy
                        id         : opts.passport_id
                        profile    : opts.passport_profile
                        cb         : cb
                else
                    cb()
        ], (err) =>
            if err
                dbg("error creating account -- #{err}")
                opts.cb(err)
            else
                dbg("successfully created account")
                opts.cb(undefined, account_id)
        )

    is_admin: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        try
            result = await is_admin(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    user_is_in_group: (opts) =>
        opts = defaults opts,
            account_id : required
            group      : required
            cb         : required
        try
            result = await user_is_in_group(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    make_user_admin: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not @_validate_opts(opts) then return
        try
            await make_user_admin(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    count_accounts_created_by: (opts) =>
        opts = defaults opts,
            ip_address : required
            age_s      : required
            cb         : required
        if not @_validate_opts(opts) then return
        try
            result = await count_accounts_created_by(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # Completely delete the given account from the database.  This doesn't
    # do any sort of cleanup of things associated with the account!  There
    # is no reason to ever use this, except for testing purposes.
    delete_account: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        @_query
            query : "DELETE FROM accounts"
            where : "account_id = $::UUID" : opts.account_id
            cb    : opts.cb

    # Mark the account as deleted, thus freeing up the email
    # address for use by another account, etc.  The actual
    # account entry remains in the database, since it may be
    # referred to by many other things (projects, logs, etc.).
    # However, the deleted field is set to true, so the account
    # is excluded from user search.
    # TODO: rewritten in packages/server/accounts/delete.ts
    mark_account_deleted: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : required
        if not opts.account_id? and not opts.email_address?
            opts.cb("one of email address or account_id must be specified -- make sure you are signed in")
            return

        query = undefined
        email_address = undefined
        async.series([
            (cb) =>
                if opts.account_id?
                    cb()
                else
                    @account_exists
                        email_address : opts.email_address
                        cb            : (err, account_id) =>
                            if err
                                cb(err)
                            else if not account_id
                                cb("no such email address known")
                            else
                                opts.account_id = account_id
                                cb()
            (cb) =>
                @_query
                    query : "SELECT email_address FROM accounts"
                    where : "account_id = $::UUID" : opts.account_id
                    cb    : one_result 'email_address', (err, x) =>
                        email_address = x; cb(err)
            (cb) =>
                @_query
                    query  : "UPDATE accounts"
                    set    :
                        "deleted::BOOLEAN"                  : true
                        "email_address_before_delete::TEXT" : email_address
                        "email_address"                     : null
                        "passports"                         : null
                    where  : "account_id = $::UUID"             : opts.account_id
                    cb     : cb
        ], opts.cb)

    account_exists: (opts) =>
        opts = defaults opts,
            email_address : required
            cb            : required   # cb(err, account_id or undefined) -- actual account_id if it exists; err = problem with db connection...
        try
            result = await account_exists(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # set an account creation action, or return all of them for the given email address
    account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            action        : undefined   # if given, adds this action; if not, returns all non-expired actions
            ttl           : 60*60*24*14 # add action with this ttl in seconds (default: 2 weeks)
            cb            : required    # if ttl not given cb(err, [array of actions])
        if opts.action?
            # add action
            @_query
                query  : 'INSERT INTO account_creation_actions'
                values :
                    'id            :: UUID'      : misc.uuid()
                    'email_address :: TEXT'      : opts.email_address
                    'action        :: JSONB'     : opts.action
                    'expire        :: TIMESTAMP' : expire_time(opts.ttl)
                cb : opts.cb
        else
            # query for actions
            @_query
                query : 'SELECT action FROM account_creation_actions'
                where :
                    'email_address  = $::TEXT'       : opts.email_address
                    'expire        >= $::TIMESTAMP'  : new Date()
                cb    : all_results('action', opts.cb)

    account_creation_actions_success: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @_query
            query : 'UPDATE accounts'
            set   :
                'creation_actions_done::BOOLEAN' : true
            where :
                'account_id = $::UUID' : opts.account_id
            cb     : opts.cb

    # DEPRECATED: use import accountCreationActions from "@cocalc/server/accounts/account-creation-actions"; instead!!!!
    do_account_creation_actions: (opts) =>
        opts = defaults opts,
            email_address : required
            account_id    : required
            cb            : required
        dbg = @_dbg("do_account_creation_actions(email_address='#{opts.email_address}')")
        dbg("**DEPRECATED!**  This will miss doing important things, e.g., creating initial project.")
        @account_creation_actions
            email_address : opts.email_address
            cb            : (err, actions) =>
                if err
                    opts.cb(err); return
                f = (action, cb) =>
                    dbg("account_creation_actions: action = #{misc.to_json(action)}")
                    if action.action == 'add_to_project'
                        @add_user_to_project
                            project_id : action.project_id
                            account_id : opts.account_id
                            group      : action.group
                            cb         : (err) =>
                                if err
                                    dbg("Error adding user to project: #{err}")
                                cb(err)
                    else
                        dbg("ERROR: skipping unknown action -- #{action.action}")
                        # also store in database so we can look into this later.
                        @log
                            event : 'unknown_action'
                            value :
                                error      : "unknown_action"
                                action     : action
                                account_id : opts.account_id
                                host       : require('os').hostname()
                        cb()
                async.map actions, f, (err) =>
                    if not err
                        @account_creation_actions_success
                            account_id : opts.account_id
                            cb         : opts.cb
                    else
                        opts.cb(err)

    verify_email_create_token: (opts) =>  # has been rewritten in backend/email/verify.ts
        opts = defaults opts,
            account_id    : required
            cb            : undefined

        locals =
            email_address : undefined
            token         : undefined
            old_challenge : undefined

        async.series([
            (cb) =>
                @_query
                    query : "SELECT email_address, email_address_challenge FROM accounts"
                    where : "account_id = $::UUID" : opts.account_id
                    cb    : one_result (err, x) =>
                        locals.email_address = x?.email_address
                        locals.old_challenge = x?.email_address_challenge
                        cb(err)
            (cb) =>
                # TODO maybe expire tokens after some time
                if locals.old_challenge?
                    old = locals.old_challenge
                    # return the same token if there is one for the same email
                    if old.token? and old.email == locals.email_address
                        locals.token = locals.old_challenge.token
                        cb()
                        return

                {generate} = require("random-key")
                locals.token = generate(16).toLowerCase()
                data =
                    email : locals.email_address
                    token : locals.token
                    time  : new Date()

                @_query
                    query  : "UPDATE accounts"
                    set    :
                        'email_address_challenge::JSONB' : data
                    where  :
                        "account_id = $::UUID"       : opts.account_id
                    cb     : cb
        ], (err) ->
            opts.cb?(err, locals)
        )


    verify_email_check_token: (opts) =>   # rewritten in server/auth/redeem-verify-email.ts
        opts = defaults opts,
            email_address : required
            token         : required
            cb            : undefined

        locals =
            account_id          : undefined
            email_address_challenge : undefined

        async.series([
            (cb) =>
                @get_account
                    email_address : opts.email_address
                    columns       : ['account_id', 'email_address_challenge']
                    cb            : (err, x) =>
                        if err
                            cb(err)
                        else if not x?
                            cb("no such email address")
                        else
                            locals.account_id          = x.account_id
                            locals.email_address_challenge = x.email_address_challenge
                            cb()
            (cb) =>
                if not locals.email_address_challenge?
                    @is_verified_email
                        email_address : opts.email_address
                        cb            : (err, verified) ->
                            if not err and verified
                                cb("This email address is already verified.")
                            else
                                cb("For this email address no account verification is setup.")

                else if locals.email_address_challenge.email != opts.email_address
                    cb("The account's email address does not match the token's email address.")

                else if locals.email_address_challenge.time < misc.hours_ago(24)
                    cb("The account verification token is no longer valid. Get a new one!")

                else
                    if locals.email_address_challenge.token == opts.token
                        cb()
                    else
                        cb("Provided token does not match.")
            (cb) =>
                # we're good, save it
                @_query
                    query  : "UPDATE accounts"
                    jsonb_set :
                        email_address_verified:
                            "#{opts.email_address}" : new Date()
                    where  : "account_id = $::UUID" : locals.account_id
                    cb     : cb
            (cb) =>
                # now delete the token
                @_query
                    query  : 'UPDATE accounts'
                    set    :
                        'email_address_challenge::JSONB' : null
                    where  :
                        "account_id = $::UUID" : locals.account_id
                    cb     : cb
        ], opts.cb)

    # returns the email address and whether or not it is verified
    verify_email_get: (opts) =>
        opts = defaults opts,
            account_id    : required
            cb            : undefined
        @_query
            query : "SELECT email_address, email_address_verified FROM accounts"
            where : "account_id = $::UUID" : opts.account_id
            cb    : one_result (err, x) ->
                opts.cb?(err, x)

    # answers the question as cb(null, [true or false])
    is_verified_email: (opts) =>  # rewritten in server/auth/redeem-verify-email.ts
        opts = defaults opts,
            email_address : required
            cb            : required
        @get_account
            email_address : opts.email_address
            columns       : ['email_address_verified']
            cb            : (err, x) =>
                if err
                    opts.cb(err)
                else if not x?
                    opts.cb("no such email address")
                else
                    verified = !!x.email_address_verified?[opts.email_address]
                    opts.cb(undefined, verified)

    ###
    Auxiliary billing related queries
    ###
    get_coupon_history: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : undefined
        try
            result = await getCouponHistory(@, opts)
            opts.cb?(undefined, result)
        catch err
            opts.cb?(err)

    update_coupon_history: (opts) =>
        opts = defaults opts,
            account_id     : required
            coupon_history : required
            cb             : undefined
        try
            await updateCouponHistory(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    ###
    Querying for searchable information about accounts.
    ###
    account_ids_to_usernames: (opts) =>
        opts = defaults opts,
            account_ids : required
            cb          : required # (err, mapping {account_id:{first_name:?, last_name:?}})
        if not @_validate_opts(opts) then return
        try
            result = await accountIdsToUsernames(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    _account_where: (opts) =>
        return accountWhere(opts)

    get_account: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            lti_id        : undefined
            columns       : undefined
            cb            : required
        if not @_validate_opts(opts) then return
        try
            result = await get_account(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # check whether or not a user is banned
    is_banned_user: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            cb            : required
        if not @_validate_opts(opts) then return
        try
            result = await is_banned_user(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    _touch_account: (account_id, cb) =>
        try
            await touchAccount(@, account_id)
            cb()
        catch err
            cb(err)

    _touch_project: (project_id, account_id, cb) =>
        try
            await touchProjectInternal(@, project_id, account_id)
            cb()
        catch err
            cb(err)

    # Indicate activity by a user, possibly on a specific project, and
    # then possibly on a specific path in that project.
    touch: (opts) =>
        opts = defaults opts,
            account_id : required
            project_id : undefined
            path       : undefined
            action     : 'edit'
            ttl_s      : 50        # min activity interval; calling this function with same input again within this interval is ignored
            cb         : undefined
        try
            await touch(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)


    # Invalidate all outstanding remember me cookies for the given account by
    # deleting them from the remember_me key:value store.
    invalidate_all_remember_me: (opts) =>
        opts = defaults opts,
            account_id    : undefined
            email_address : undefined
            cb            : undefined
        if not @_validate_opts(opts) then return
        try
            await invalidate_all_remember_me(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    # Get remember me cookie with given hash.  If it has expired,
    # **get back undefined instead**.  (Actually deleting expired).
    # We use retry_until_success, since an intermittent database
    # reconnect can result in a cb error that will very soon
    # work fine, and we don't to flat out sign the client out
    # just because of this.
    get_remember_me: (opts) =>
        opts = defaults opts,
            hash                : required
            cache               : true
            cb                  : required   # cb(err, signed_in_message | undefined)
        signed_in = undefined
        try
            signed_in = await get_remember_me_message(@, opts)
        catch err
            opts.cb(err)
            return
        if signed_in
            opts.cb(undefined, signed_in)
        else
            opts.cb()

    delete_remember_me: (opts) =>
        opts = defaults opts,
            hash : required
            cb   : undefined
        try
            await delete_remember_me(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    # ASYNC FUNCTION
    get_personal_user: () =>
        return await get_personal_user(@)

    ###
    # Changing password/email, etc. sensitive info about a user
    ###

    # Change the password for the given account.
    change_password: (opts={}) =>
        opts = defaults opts,
            account_id             : required
            password_hash          : required
            invalidate_remember_me : true
            cb                     : required
        if not @_validate_opts(opts) then return
        try
            await change_password(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    # Reset Password MEANT FOR INTERACTIVE USE -- if password is not given, will prompt for it.
    reset_password: (opts) =>
        opts = defaults opts,
            email_address : undefined
            account_id    : undefined
            password      : undefined
            random        : true      # if true (the default), will generate and print a random password.
            cb            : undefined
        try
            await reset_password(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    # Change the email address, unless the email_address we're changing to is already taken.
    # If there is a stripe customer ID, we also call the update process to maybe sync the changed email address
    change_email_address: (opts={}) =>
        opts = defaults opts,
            account_id    : required
            email_address : required
            stripe        : required
            cb            : required
        if not @_validate_opts(opts) then return
        async.series([
            (cb) =>
                @account_exists
                    email_address : opts.email_address
                    cb            : (err, exists) =>
                        if err
                            cb(err)
                            return
                        if exists
                            cb("email_already_taken")
                            return
                        cb()
            (cb) =>
                @_query
                    query : 'UPDATE accounts'
                    set   : {email_address: opts.email_address}
                    where : @_account_where(opts)
                    cb    : cb
            (cb) =>
                @_query
                    query : "SELECT stripe_customer_id FROM accounts"
                    where : "account_id = $::UUID" : opts.account_id
                    cb    : one_result (err, x) =>
                        if err
                            cb(err)
                            return
                        if x.stripe_customer_id
                            try
                                await syncCustomer
                                    account_id  : opts.account_id
                                    stripe      : opts.stripe
                                    customer_id : x.stripe_customer_id
                                cb()
                            catch err
                                cb(err)
                        else
                            cb()
        ], (err) =>
            opts.cb(err)
        )

    ###
    Password reset
    ###
    set_password_reset: (opts) =>
        opts = defaults opts,
            email_address : required
            ttl           : required
            cb            : required   # cb(err, uuid)
        try
            id = await set_password_reset(@, opts)
            opts.cb(undefined, id)
        catch err
            opts.cb(err)

    get_password_reset: (opts) =>
        opts = defaults opts,
            id : required
            cb : required   # cb(err, true if allowed and false if not)
        try
            result = await get_password_reset(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    delete_password_reset: (opts) =>
        opts = defaults opts,
            id : required
            cb : required   # cb(err, true if allowed and false if not)
        try
            await delete_password_reset(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    record_password_reset_attempt: (opts) =>
        opts = defaults opts,
            email_address : required
            ip_address    : required
            ttl           : required
            cb            : required   # cb(err)
        try
            await record_password_reset_attempt(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    count_password_reset_attempts: (opts) =>
        opts = defaults opts,
            email_address : undefined  # must give one of email_address or ip_address
            ip_address    : undefined
            age_s         : required   # at most this old
            cb            : required   # cb(err)
        try
            result = await count_password_reset_attempts(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    ###
    Tracking file access

    log_file_access is throttled in each server, in the sense that
    if it is called with the same input within a minute, those
    subsequent calls are ignored.  Of course, if multiple servers
    are recording file_access then there can be more than one
    entry per minute.
    ###
    log_file_access: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            filename   : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        try
            await log_file_access(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    ###
    Efficiently get all files access times subject to various constraints...

    NOTE: this was not available in RethinkDB version (too painful to implement!), but here it is,
    easily sliceable in any way.  This could be VERY useful for users!
    ###
    get_file_access: (opts) =>
        opts = defaults opts,
            start      : undefined   # start time
            end        : undefined  # end time
            project_id : undefined
            account_id : undefined
            filename   : undefined
            cb    : required
        try
            result = await get_file_access(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    ###
    File editing activity -- users modifying files in any way
      - one single table called file_activity
      - table also records info about whether or not activity has been seen by users
    ###
    record_file_use: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            account_id : required
            action     : required  # 'edit', 'read', 'seen', 'chat', etc.?
            cb         : required
        try
            await record_file_use(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    get_file_use: (opts) =>
        opts = defaults opts,
            max_age_s   : undefined
            project_id  : undefined    # don't specify both project_id and project_ids
            project_ids : undefined
            path        : undefined    # if given, project_id must be given
            cb          : required     # one entry if path given; otherwise, an array of entries.
        try
            result = await get_file_use(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    _validate_opts: (opts) =>
        for k, v of opts
            if k == 'lti_id'
                if not (Array.isArray(v) and v.length > 0)
                    opts.cb?("invalid #{k} -- can't be an empty array")
                    return false
                for x in v
                    if not (typeof x == 'string' and x.length > 0)
                        opts.cb?("invalid #{k} -- #{v}")
                        return false
            else if k.slice(k.length-2) == 'id'
                if v? and not misc.is_valid_uuid_string(v)
                    opts.cb?("invalid #{k} -- #{v}")
                    return false
            if k.slice(k.length-3) == 'ids'
                for w in v
                    if not misc.is_valid_uuid_string(w)
                        opts.cb?("invalid uuid #{w} in #{k} -- #{misc.to_json(v)}")
                        return false
            if k == 'group' and v not in misc.PROJECT_GROUPS
                opts.cb?("unknown project group '#{v}'"); return false
            if k == 'groups'
                for w in v
                    if w not in misc.PROJECT_GROUPS
                        opts.cb?("unknown project group '#{w}' in groups"); return false

        return true

    get_project: (opts) =>
        opts = defaults opts,
            project_id : required   # an array of id's
            columns    : PROJECT_COLUMNS
            cb         : required
        if not @_validate_opts(opts) then return
        try
            result = await get_project(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    _get_project_column: (column, project_id, cb) =>
        try
            result = await _get_project_column(@, column, project_id)
            cb(undefined, result)
        catch err
            cb(err)

    get_user_column: (column, account_id, cb) =>
        try
            result = await get_user_column(@, column, account_id)
            cb(undefined, result)
        catch err
            cb(err)

    add_user_to_project: (opts) =>
        opts = defaults opts,
            project_id   : required
            account_id   : required
            group        : 'collaborator'  # see misc.PROJECT_GROUPS above
            cb           : required  # cb(err)

        if not @_validate_opts(opts) then return

        @_query
            query       : 'UPDATE projects'
            jsonb_merge :
                users   :
                    "#{opts.account_id}":
                        group: opts.group
            where       :
                "project_id = $::UUID": opts.project_id
            cb          : opts.cb

    set_project_status: (opts) =>
        opts = defaults opts,
            project_id : required
            status     : required
            cb         : undefined
        @_query
            query : "UPDATE projects"
            set   : {"status::JSONB"   : opts.status}
            where : {"project_id = $::UUID": opts.project_id}
            cb    : opts.cb


    # Remove the given collaborator from the project.
    # Attempts to remove an *owner* via this function will silently fail (change their group first),
    # as will attempts to remove a user not on the project, or to remove from a non-existent project.
    remove_collaborator_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        @_query
            query     : 'UPDATE projects'
            jsonb_set : {users : {"#{opts.account_id}": null}}
            where     :
                'project_id :: UUID = $'                          : opts.project_id
                "users#>>'{#{opts.account_id},group}' != $::TEXT" : 'owner'
            cb        : opts.cb

    # remove any user, even an owner.
    remove_user_from_project: (opts) =>
        opts = defaults opts,
            project_id : required
            account_id : required
            cb         : required  # cb(err)
        if not @_validate_opts(opts) then return
        @_query
            query     : 'UPDATE projects'
            jsonb_set : {users : {"#{opts.account_id}": null}}
            where     : {'project_id :: UUID = $' : opts.project_id}
            cb        : opts.cb

    # Return a list of the account_id's of all collaborators of the given users.
    get_collaborator_ids: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        dbg = @_dbg("get_collaborator_ids")
        try
            result = await get_collaborator_ids(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # get list of project collaborator IDs
    get_collaborators: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        dbg = @_dbg("get_collaborators")
        try
            result = await get_collaborators(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)


    # return list of paths that are public and not disabled in the given project
    get_public_paths: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required
        if not @_validate_opts(opts) then return
        try
            result = await get_public_paths(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    has_public_path: (opts) =>
        opts = defaults opts,
            project_id  : required
            cb          : required    # cb(err, has_public_path)
        try
            result = await has_public_path(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    path_is_public: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            cb         : required
        try
            result = await path_is_public(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    filter_public_paths: (opts) =>
        opts = defaults opts,
            project_id : required
            path       : required
            listing    : required   # files in path [{name:..., isdir:boolean, ....}, ...]
            cb         : required
        try
            result = await filter_public_paths(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # Set last_edited for this project to right now, and possibly update its size.
    # It is safe and efficient to call this function very frequently since it will
    # actually hit the database at most once every 30s (per project, per client).  In particular,
    # once called, it ignores subsequent calls for the same project for 30s.
    touch_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : undefined
        if not @_validate_opts(opts) then return
        try
            await touchProject(@, opts)
            opts.cb?()
        catch err
            opts.cb?(err)

    recently_modified_projects: (opts) =>
        opts = defaults opts,
            max_age_s : required
            cb        : required
        try
            result = await recently_modified_projects(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    get_open_unused_projects: (opts) =>
        opts = defaults opts,
            min_age_days : 30         # project must not have been edited in this much time
            max_age_days : 120        # project must have been edited at most this long ago
            host         : required   # hostname of where project is opened
            cb           : required
        try
            result = await get_open_unused_projects(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # cb(err, true if user is in one of the groups for the project **or an admin**)
    user_is_in_project_group: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : undefined
            groups      : ['owner', 'collaborator']
            cache       : false  # if true cache result for a few seconds
            cb          : required  # cb(err, true if in group)
        if not opts.account_id?
            # clearly user -- who isn't even signed in -- is not in the group
            opts.cb(undefined, false)
            return
        if not @_validate_opts(opts) then return
        try
            result = await user_is_in_project_group(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # cb(err, true if user is an actual collab; ADMINS do not count)
    user_is_collaborator: (opts) =>
        opts = defaults opts,
            project_id  : required
            account_id  : required
            cache       : true
            cb          : required  # cb(err, true if is actual collab on project)
        if not @_validate_opts(opts) then return
        try
            result = await user_is_collaborator(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # all id's of projects having anything to do with the given account
    get_project_ids_with_user: (opts) =>
        opts = defaults opts,
            account_id : required
            is_owner   : undefined     # if set to true, only return projects with this owner.
            cb         : required      # opts.cb(err, [project_id, project_id, project_id, ...])
        if not @_validate_opts(opts) then return
        try
            result = await get_project_ids_with_user(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # cb(err, array of account_id's of accounts in non-invited-only groups)
    # TODO: add something about invited users too and show them in UI!
    get_account_ids_using_project: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        if not @_validate_opts(opts) then return
        try
            result = await get_account_ids_using_project(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # Have we successfully (no error) sent an invite to the given email address?
    # If so, returns timestamp of when.
    # If not, returns 0.
    when_sent_project_invite: (opts) =>
        opts = defaults opts,
            project_id : required
            to         : required  # an email address
            cb         : required
        if not @_validate_opts(opts) then return
        # in particular, emails like bla'foo@bar.com → bla''foo@bar.com
        sani_to = @sanitize("{\"#{opts.to}\"}")
        query_select = "SELECT invite#>#{sani_to} AS to FROM projects"
        @_query
            query : query_select
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : one_result 'to', (err, y) =>
                opts.cb(err, if not y? or y.error or not y.time then 0 else new Date(y.time))

    # call this to record that we have sent an email invite to the given email address
    sent_project_invite: (opts) =>
        opts = defaults opts,
            project_id : required
            to         : required   # an email address
            error      : undefined  # if there was an error set it to this; leave undefined to mean that sending succeeded
            cb         : undefined
        x = {time: new Date()}
        if opts.error?
            x.error = opts.error
        @_query
            query : "UPDATE projects"
            jsonb_merge :
                {invite : "#{opts.to}" : {time: new Date(), error:opts.error}}
            where : 'project_id :: UUID = $' : opts.project_id
            cb : opts.cb

    ###
    Project host, storage location, and state.
    ###
    set_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            host       : required
            cb         : required
        assigned = new Date()
        @_query
            query : "UPDATE projects"
            jsonb_set :
                host : {host:opts.host, assigned:assigned}
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : (err) => opts.cb(err, assigned)

    unset_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "UPDATE projects"
            set   :
                host : null
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : opts.cb

    get_project_host: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "SELECT host#>>'{host}' AS host FROM projects"
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : one_result('host', opts.cb)

    set_project_storage: (opts) =>
        opts = defaults opts,
            project_id : required
            host       : required
            cb         : required
        @get_project_storage
            project_id : opts.project_id
            cb         : (err, current) =>
                if err
                    opts.cb(err)
                    return
                if current?.host? and current.host != opts.host
                    opts.cb("change storage not implemented yet -- need to implement saving previous host")
                else
                    # easy case -- assigning for the first time
                    assigned = new Date()
                    @_query
                        query : "UPDATE projects"
                        jsonb_set :
                            storage : {host:opts.host, assigned:assigned}
                        where : 'project_id :: UUID = $' : opts.project_id
                        cb    : (err) => opts.cb(err, assigned)

    get_project_storage: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_get_project_column('storage', opts.project_id, opts.cb)

    update_project_storage_save: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "UPDATE projects"
            jsonb_merge :
                storage : {saved:new Date()}
            where : 'project_id :: UUID = $' : opts.project_id
            cb    : opts.cb

    set_project_storage_request: (opts) =>
        opts = defaults opts,
            project_id : required
            action     : required    # 'save', 'close', 'open', 'move'
            target     : undefined   # needed for 'open' and 'move'
            cb         : required
        try
            await setProjectStorageRequest(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    get_project_storage_request: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        try
            result = await getProjectStorageRequest(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    set_project_state: (opts) =>
        opts = defaults opts,
            project_id : required
            state      : required
            time       : new Date()
            error      : undefined
            ip         : undefined   # optional ip address
            cb         : required
        try
            await setProjectState(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    get_project_state: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        try
            result = await getProjectState(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    ###
    Project quotas and upgrades
    ###

    # Returns the total quotas for the project, including any
    # upgrades to the base settings.
    get_project_quotas: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        settings = users = site_license = server_settings = undefined
        async.parallel([
            (cb) =>
                @_query
                    query : 'SELECT settings, users, site_license FROM projects'
                    where : 'project_id = $::UUID' : opts.project_id
                    cb    : one_result (err, x) =>
                        settings = x.settings
                        site_license = x.site_license
                        users = x.users
                        cb(err)
            (cb) =>
                @get_server_settings_cached
                    cb : (err, x) =>
                        server_settings = x
                        cb(err)
        ], (err) =>
            if err
                opts.cb(err)
            else
                upgrades = quota(settings, users, site_license, server_settings)
                opts.cb(undefined, upgrades)
        )

    # Return mapping from project_id to map listing the upgrades this particular user
    # applied to the given project.  This only includes project_id's of projects that
    # this user may have upgraded in some way.
    get_user_project_upgrades: (opts) =>
        opts = defaults opts,
            account_id : required
            cb         : required
        @_query
            query : "SELECT project_id, users#>'{#{opts.account_id},upgrades}' AS upgrades FROM projects"
            where : [
                'users ? $::TEXT' : opts.account_id,    # this is a user of the project
                "users#>'{#{opts.account_id},upgrades}' IS NOT NULL"     # upgrades are defined
            ]
            cb : (err, result) =>
                if err
                    opts.cb(err)
                else
                    x = {}
                    for p in result.rows
                        x[p.project_id] = p.upgrades
                    opts.cb(undefined, x)

    # Ensure that all upgrades applied by the given user to projects are consistent,
    # truncating any that exceed their allotment.  NOTE: Unless there is a bug,
    # the only way the quotas should ever exceed their allotment would be if the
    # user is trying to cheat... *OR* a subscription was canceled or ended.
    ensure_user_project_upgrades_are_valid: (opts) =>
        opts = defaults opts,
            account_id : required
            fix        : true       # if true, will fix projects in database whose quotas exceed the allotted amount; it is the caller's responsibility to actually change them.
            cb         : required   # cb(err, excess)
        dbg = @_dbg("ensure_user_project_upgrades_are_valid(account_id='#{opts.account_id}')")
        dbg()
        excess = stripe_data = project_upgrades = undefined
        async.series([
            (cb) =>
                async.parallel([
                    (cb) =>
                        @_query
                            query : 'SELECT stripe_customer FROM accounts'
                            where : 'account_id = $::UUID' : opts.account_id
                            cb    : one_result 'stripe_customer', (err, stripe_customer) =>
                                stripe_data = stripe_customer?.subscriptions?.data
                                cb(err)
                    (cb) =>
                        @get_user_project_upgrades
                            account_id : opts.account_id
                            cb         : (err, x) =>
                                project_upgrades = x
                                cb(err)
                ], cb)
            (cb) =>
                excess = require('@cocalc/util/upgrades').available_upgrades(stripe_data, project_upgrades).excess
                if opts.fix
                    fix = (project_id, cb) =>
                        dbg("fixing project_id='#{project_id}' with excess #{JSON.stringify(excess[project_id])}")
                        upgrades = undefined
                        async.series([
                            (cb) =>
                                @_query
                                    query : "SELECT users#>'{#{opts.account_id},upgrades}' AS upgrades FROM projects"
                                    where : 'project_id = $::UUID' : project_id
                                    cb    : one_result 'upgrades', (err, x) =>
                                        upgrades = x; cb(err)
                            (cb) =>
                                if not upgrades?
                                    cb(); return
                                # WORRY: this is dangerous since if something else changed about a user
                                # between the read/write here, then we would have trouble.  (This is milliseconds of time though...)
                                for k, v of excess[project_id]
                                    upgrades[k] -= v
                                @_query
                                    query       : "UPDATE projects"
                                    where       : 'project_id = $::UUID' : project_id
                                    jsonb_merge :
                                        users : {"#{opts.account_id}": {upgrades: upgrades}}
                                    cb          : cb
                        ], cb)
                    async.map(misc.keys(excess), fix, cb)
                else
                    cb()
        ], (err) =>
            opts.cb(err, excess)
        )

    # Loop through every user of cocalc that is connected with stripe (so may have a subscription),
    # and ensure that any upgrades that have applied to projects are valid.  It is important to
    # run this periodically or there is a really natural common case where users can cheat:
    #    (1) they apply upgrades to a project
    #    (2) their subscription expires
    #    (3) they do NOT touch upgrades on any projects again.
    ensure_all_user_project_upgrades_are_valid: (opts) =>
        opts = defaults opts,
            limit : 1          # We only default to 1 at a time, since there is no hurry.
            cb    : required
        dbg = @_dbg("ensure_all_user_project_upgrades_are_valid")
        locals = {}
        async.series([
            (cb) =>
                @_query
                    query : "SELECT account_id FROM accounts"
                    where : "stripe_customer_id IS NOT NULL"
                    timeout_s: 300
                    cb    : all_results 'account_id', (err, account_ids) =>
                        locals.account_ids = account_ids
                        cb(err)
            (cb) =>
                m = 0
                n = locals.account_ids.length
                dbg("got #{n} accounts with stripe")
                f = (account_id, cb) =>
                    m += 1
                    dbg("#{m}/#{n}")
                    @ensure_user_project_upgrades_are_valid
                        account_id : account_id
                        cb         : cb
                async.mapLimit(locals.account_ids, opts.limit, f, cb)
        ], opts.cb)

    # Return the sum total of all user upgrades to a particular project
    get_project_upgrades: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : 'SELECT users FROM projects'
            where : 'project_id = $::UUID' : opts.project_id
            cb    : one_result 'users', (err, users) =>
                if err
                    opts.cb(err); return
                upgrades = undefined
                if users?
                    for account_id, info of users
                        upgrades = misc.map_sum(upgrades, info.upgrades)
                opts.cb(undefined, upgrades)

    # Remove all upgrades to all projects applied by this particular user.
    remove_all_user_project_upgrades: (opts) =>
        opts = defaults opts,
            account_id : required
            projects   : undefined  # if given, only remove from projects with id in this array.
            cb         : required
        if not misc.is_valid_uuid_string(opts.account_id)
            opts.cb("invalid account_id")
            return
        query =  "UPDATE projects SET users=jsonb_set(users, '{#{opts.account_id}}', jsonb(users#>'{#{opts.account_id}}') - 'upgrades')"
        where = [
                'users ? $::TEXT' : opts.account_id,                     # this is a user of the project
                "users#>'{#{opts.account_id},upgrades}' IS NOT NULL"     # upgrades are defined
            ]
        if opts.projects
            if not misc.is_array(opts.projects)
                opts.cb("projects must be an array")
                return
            w = []
            for project_id in opts.projects
                if not misc.is_valid_uuid_string(project_id)
                    opts.cb('each entry in projects must be a valid uuid')
                    return
                w.push("'#{project_id}'")
            where.push("project_id in (#{w.join(',')})")

        @_query
            query : query
            where : where
            cb: opts.cb
        # TODO: any impacted project that is currently running should also (optionally?) get restarted.
        # I'm not going to bother for now, but this DOES need to get implemented, since otherwise users
        # can cheat too easily.  Alternatively, have a periodic control loop on all running projects that
        # confirms that everything is legit (and remove the verification code for user_query) --
        # that's probably better.  This could be a service called manage-upgrades.

    ###
    Project settings
    ###
    get_project_settings: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "SELECT settings FROM projects"
            where : 'project_id = $::UUID' : opts.project_id
            cb    : one_result 'settings', (err, settings) =>
                if err
                    opts.cb(err)
                else if not settings?
                    opts.cb(undefined, misc.copy(DEFAULT_QUOTAS))
                else
                    settings = misc.coerce_codomain_to_numbers(settings)
                    quotas = {}
                    for k, v of DEFAULT_QUOTAS
                        quotas[k] = if not settings[k]? then v else settings[k]
                    opts.cb(undefined, quotas)

    set_project_settings: (opts) =>
        opts = defaults opts,
            project_id : required
            settings   : required   # can be any subset of the map
            cb         : required
        @_query
            query       : "UPDATE projects"
            where       : 'project_id = $::UUID' : opts.project_id
            jsonb_merge : {settings: opts.settings}
            cb          : opts.cb

    get_project_extra_env: (opts) =>
        opts = defaults opts,
            project_id : required
            cb         : required
        @_query
            query : "SELECT env FROM projects"
            where : 'project_id = $::UUID' : opts.project_id
            cb    : one_result 'env', (err, env) =>
                if err
                    opts.cb(err)
                else
                    opts.cb(undefined, env ? {})


    recent_projects: (opts) =>
        opts = defaults opts,
            age_m     : required   # return results at most this old
            min_age_m : 0          # only returns results at least this old
            pluck     : undefined  # if not given, returns list of project_id's; if given (as an array), returns objects with these fields
            cb        : required   # cb(err, list of strings or objects)

        if opts.pluck?
            columns = opts.pluck.join(',')
            cb = all_results(opts.cb)
        else
            columns = 'project_id'
            cb = all_results('project_id', opts.cb)
        @_query
            query : "SELECT #{columns} FROM projects"
            where :
                "last_edited >= $::TIMESTAMP" : misc.minutes_ago(opts.age_m)
                "last_edited <= $::TIMESTAMP" : misc.minutes_ago(opts.min_age_m)
            cb    : cb

    get_stats_interval: (opts) =>
        opts = defaults opts,
            start : required
            end   : required
            cb    : required
        try
            result = await get_stats_interval(@, opts)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    # If there is a cached version of stats (which has given ttl) return that -- this could have
    # been computed by any of the hubs.  If there is no cached version, compute new one and store
    # in cache for ttl seconds.
    get_stats: (opts) =>
        opts = defaults opts,
            ttl_dt : 15       # 15 secs subtracted from ttl to compensate for computation duration when called via a cronjob
            ttl    : 5*60     # how long cached version lives (in seconds)
            ttl_db : 30       # how long a valid result from a db query is cached in any case
            update : true     # true: recalculate if older than ttl; false: don't recalculate and pick it from the DB (locally cached for ttl secs)
            cb     : undefined
        return await calc_stats(@, opts)

    get_active_student_stats: (opts) =>
        opts = defaults opts,
            cb  : required
        try
            result = await get_active_student_stats(@)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)


    ###
    Hub servers
    ###
    register_hub: (opts) =>
        opts = defaults opts,
            host    : required
            port    : required
            clients : required
            ttl     : required
            cb      : required
        try
            await register_hub(@, opts)
            opts.cb()
        catch err
            opts.cb(err)

    get_hub_servers: (opts) =>
        opts = defaults opts,
            cb   : required
        try
            result = await get_hub_servers(@)
            opts.cb(undefined, result)
        catch err
            opts.cb(err)

    ###
    Custom software images
    ###

    # this is 100% for cc-in-cc dev projects only!
    insert_random_compute_images: (opts) =>
        opts = defaults opts,
            cb     : required

        dbg = @_dbg("database::insert_random_compute_images")
        dbg()

        capitalize = require('@cocalc/util/misc').capitalize

        words = [
                    'wizard', 'jupyter', 'carrot', 'python', 'science', 'gold', 'eagle',
                    'advanced', 'course', 'yellow', 'bioinformatics', 'R', 'electric', 'sheep',
                    'theory', 'math', 'physics', 'calculate', 'primer', 'DNA', 'tech', 'space'
                ]

        # deterministically sample distinct words (such that this is stable after a restart)
        sample = (idx=0, n=1) ->
            N = words.length
            K = (idx * 997) %% N
            ret = []
            for i in [0..n]
                for j in [0..N]
                    w = words[(K + 97 * i + j) %% N]
                    if ret.includes(w)
                        continue
                    else
                        ret.push(w)
                        break
            return ret

        rseed = 123
        random = ->
            x = Math.sin(rseed++)
            r = x - Math.floor(x)
            return r

        create = (idx, cb) =>
            rnd  = sample(idx, 3)
            id   = rnd[...2].join('-') + "-#{idx}"
            provider = ['github.com', 'gitlab.com', 'bitbucket.org'][idx % 3]
            src = "https://#{provider}/#{rnd[2]}/#{id}.git"

            # not all of them have a display-title, url, desc, ...
            if random() > .25
                if random() > .5
                    extra = "(#{sample(idx + 2)})"
                else
                    extra = sample(idx+5, 2)
                disp = (capitalize(_) for _ in rnd[...2].concat(extra)).join(' ')
            else
                if random() > .5
                    disp = undefined
                else
                    disp = ''

            if random() > .5
                url = "https://www.google.com/search?q=#{rnd.join('%20')}"
            else
                url = undefined

            if random() > .5
                if random() > .5
                    verylong = Array(100).fill('very long *text* for **testing**, ').join(" ")
                if url?
                    other_page = ", or point to [yet another page](#{url})"
                else
                    other_page = ""
                desc = """
                       This is some text describing what **#{disp or id}** is.
                       Here could also be an [external link](https://doc.cocalc.com).
                       It might also mention `#{id}`#{other_page}.

                       #{verylong ? ''}
                       """
            else
                desc = undefined

            path = if random() > .5 then "index.ipynb" else "subdir/"
            tag = if random() > .25 then "master" else null


            @_query
                query  : "INSERT INTO compute_images"
                values :
                    "id      :: TEXT     " : id
                    "src     :: TEXT     " : src
                    "type    :: TEXT     " : 'custom'
                    "desc    :: TEXT     " : desc
                    "display :: TEXT     " : disp
                    "path    :: TEXT     " : path
                    "url     :: TEXT     " : url
                    "disabled:: BOOLEAN  " : idx == 1
                cb     : cb

        # first we wipe the table's content, then we generate some random stuff
        async.series([
            (cb) =>
                @_query
                    query  : 'DELETE FROM compute_images'
                    where  : '1 = 1'
                    cb     : cb

            (cb) =>
                async.mapSeries([0..20], create, cb)

        ], (err) =>
            dbg("all done")
            opts.cb()
        )



    # Delete all patches, the blobs if archived, and the syncstring object itself
    # Basically this erases everything from cocalc related to the file edit history
    # of a given file... except ZFS snapshots.
    delete_syncstring: (opts) =>
        opts = defaults opts,
            string_id : required
            cb        : required
        if not opts.string_id or misc.len(opts.string_id) != 40
            # be extra careful!
            opts.cb("invalid string_id")
            return

        locals =
            syncstring : undefined
            where : {"string_id = $::CHAR(40)" : opts.string_id}

        async.series([
            (cb) =>
                @_query
                    query : "SELECT * FROM syncstrings"
                    where : locals.where
                    cb    : (err, results) =>
                        if err
                            cb(err)
                            return
                        locals.syncstring = results.rows[0]
                        cb()
            (cb) =>
                if not locals.syncstring?
                    # no syncstring with this id.
                    cb(); return
                # delete the syncstring record (we do this first before deleting what if references,
                # since having a syncstring record referencing missing data would be a disaster, meaning
                # the user could never open their file -- with this sequence it just means some wasted
                # disks pace).
                @_query
                    query : "DELETE FROM syncstrings"
                    where : locals.where
                    cb    : cb
            (cb) =>
                if not locals.syncstring?
                    # no syncstring with this id.
                    cb(); return
                if locals.syncstring.archived
                    # is archived, so delete the blob
                    @delete_blob
                        uuid : locals.syncstring.archived
                        cb   : cb
                else
                    # is not archived, so delete the patches
                    @_query
                        query : "DELETE FROM patches"
                        where : locals.where
                        timeout_s: 300
                        cb    : cb
        ], opts.cb)

    # async function
    site_license_usage_stats: () =>
        return await site_license_usage_stats(@)

    # async function
    projects_using_site_license: (opts) =>
        return await projects_using_site_license(@, opts)

    # async function
    number_of_projects_using_site_license: (opts) =>
        return await number_of_projects_using_site_license(@, opts)

    # async function
    site_license_public_info: (license_id) =>
        return await site_license_public_info(@, license_id)

    # async function
    site_license_manager_set: (license_id, info) =>
        return await site_license_manager_set(@, license_id, info)

    # async function
    update_site_license_usage_log: =>
        return await update_site_license_usage_log(@)

    # async function
    matching_site_licenses: (...args) =>
        return await matching_site_licenses(@, ...args)

    # async function
    manager_site_licenses: (...args) =>
        return await manager_site_licenses(@, ...args)

    # async function
    project_datastore_set: (...args) =>
        return await project_datastore_set(@, ...args)

    # async function
    project_datastore_get: (...args) =>
        return await project_datastore_get(@, ...args)

    # async function
    project_datastore_del: (...args) =>
        return await project_datastore_del(@, ...args)

    # async function
    permanently_unlink_all_deleted_projects_of_user: (account_id_or_email_address) =>
        return await permanently_unlink_all_deleted_projects_of_user(@, account_id_or_email_address)

    # async function
    unlink_old_deleted_projects: () =>
        return await unlink_old_deleted_projects(@)

    # async function
    unlist_all_public_paths: (account_id, is_owner) =>
        return await unlist_all_public_paths(@, account_id, is_owner)

    # async
    projects_that_need_to_be_started: () =>
        return await projects_that_need_to_be_started(@)

    # async
    # this *merges* in the run_quota; it doesn't replace it.
    set_run_quota: (project_id, run_quota) =>
        return await @async_query
            query       : "UPDATE projects"
            jsonb_merge : {run_quota:run_quota}
            where       : {project_id:project_id}

    # async -- true if they are a manager on a license or have
    # any subscriptions.
    is_paying_customer: (account_id) =>
        return await is_paying_customer(@, account_id)

    # async
    get_all_public_paths: (account_id) =>
        return await get_all_public_paths(@, account_id)

    # async
    # Return true if the given account is a member or
    # owner of the given organization.
    accountIsInOrganization: (opts) =>
        result = await @async_query
            query : 'SELECT COUNT(*) FROM organizations'
            cache : true
            where : ['organization_id :: UUID = $1', "users ? $2"]
            params: [opts.organization_id, opts.account_id]
        return parseInt(result?.rows?[0]?.count) > 0

    # given a name, returns undefined if it is not in use,
    # and the account_id or organization_id that is using it
    # if it is in use.
    nameToAccountOrOrganization: (name) =>
        name = name.toLowerCase()
        result = await @async_query
            query : 'SELECT account_id FROM accounts'
            cache : false
            where : ['LOWER(name) = $1']
            params: [name]
        if result.rows.length > 0
            return result.rows[0].account_id
        result = await @async_query
            query : 'SELECT organization_id FROM organizations'
            cache : false
            where : ['LOWER(name) = $1']
            params: [name]
        if result.rows.length > 0
            return result.rows[0].organization_id
        return undefined

    # async
    registrationTokens: (options, query) =>
        return await registrationTokens(@, options, query)

    updateUnreadMessageCount: (opts) =>
        return await updateUnreadMessageCount(opts)
