###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2015, William Stein
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################

exports.SCHEMA =
    server_settings:
        primary_key : 'name'
        anonymous : false
        fields :
            name  : true
            value : true
        admin_query:
            # NOTE: can *set* but cannot get!
            set:
                fields:
                    name  : null
                    value : null

    stats :
        primary_key: 'id'
        anonymous : true   # allow user access, even if not signed in
        fields:
            id                  : true
            timestamp           : true
            accounts            : true
            projects            : true
            active_projects     : true
            last_day_projects   : true
            last_week_projects  : true
            last_month_projects : true
            hub_servers         : true
        indexes:
            timestamp : []
        user_query:
            get:
                all :
                    cmd  : 'between'
                    args : (obj) ->
                        [new Date(new Date() - 1000*60*60), (->obj.this.r.maxval), {index:'timestamp'}]
                fields :
                    id                  : null
                    timestamp           : null
                    accounts            : 0
                    projects            : 0
                    active_projects     : 0
                    last_day_projects   : 0
                    last_week_projects  : 0
                    last_month_projects : 0
                    hub_servers         : []
    file_use:
        primary_key: 'id'
        fields:
            id          : true
            project_id  : true
            path        : true
            users       : true
            last_edited : true
        user_query:
            get :
                all :
                    cmd  : 'getAll'
                    args : ['all_projects_read', index:'project_id']
                fields :
                    id          : null
                    project_id  : null
                    path        : null
                    users       : null
                    last_edited : null
            set :
                fields :
                    id          : (obj) -> misc_node.sha1("#{obj.project_id}#{obj.path}")
                    project_id  : 'project_write'
                    path        : true
                    users       : true
                    last_edited : true

    project_log:
        primary_key: 'id'
        fields :
            id          : true
            project_id  : true
            time        : true
            event       : true
        user_query:
            get :
                all:
                    cmd  : 'getAll'
                    args : ['project_id', index:'project_id']
                fields :
                    id          : null
                    project_id  : null
                    time        : null
                    event       : null
            set :
                fields :
                    project_id : 'project_write'
                    time       : true
                    event      : true

    projects:
        primary_key: 'project_id'
        fields :
            project_id  : true
            title       : true
            description : true
            users       : true
            files       : true
            deleted     : true
            host        : true
            settings    : true
            status      : true
            state       : true
            last_edited : true
            last_active : true
        indexes :
            users : ["that.r.row('users').keys()", {multi:true}]
        user_query:
            get :
                all :
                    cmd  : 'getAll'
                    args : ['account_id', index:'users']
                fields :
                    project_id  : null
                    title       : ''
                    description : ''
                    users       : {}
                    deleted     : null
                    host        : null
                    settings    : null
                    status      : null
                    state       : null
                    last_edited : null
                    last_active : null
            set :
                fields :
                    project_id  : 'all_projects_write'
                    title       : true
                    description : true
                    deleted     : true
                    users       :         # TODO: actually implement refined permissions
                        '{account_id}':
                            hide : true

    collaborators :
        primary_key : 'account_id'
        anonymous   : false
        virtual     : 'accounts'
        user_query:
            get :
                all :
                    method : 'getAll'
                    args   : ['collaborators']
                fields :
                    account_id  : null
                    first_name  : ''
                    last_name   : ''
                    last_active : null
    accounts:
        primary_key : 'account_id'
        fields :
            account_id      : true
            email_address   : true
            editor_settings : true
            other_settings  : true
            first_name      : true
            last_name       : true
            terminal        : true
            autosave        : true
            evaluate_key    : true
            passports       : true
            last_active     : true
        user_query :
            get :
                all :
                    cmd  : 'getAll'
                    args : ['account_id']
                fields :
                    account_id      : null
                    email_address   : null
                    editor_settings :
                        strip_trailing_whitespace : false
                        show_trailing_whitespace  : true
                        line_wrapping             : true
                        line_numbers              : true
                        smart_indent              : true
                        electric_chars            : true
                        match_brackets            : true
                        auto_close_brackets       : true
                        code_folding              : true
                        match_xml_tags            : true
                        auto_close_xml_tags       : true
                        spaces_instead_of_tabs    : true
                        multiple_cursors          : true
                        track_revisions           : true
                        extra_button_bar          : true
                        first_line_number         : 1
                        indent_unit               : 4
                        tab_size                  : 4
                        bindings                  : "standard"
                        theme                     : "default"
                        undo_depth                : 300
                    other_settings  :
                        confirm_close     : false
                        mask_files        : true
                        default_file_sort : 'time'
                    first_name      : ''
                    last_name       : ''
                    terminal        :
                        font_size    : 14
                        color_scheme : 'default'
                        font         : 'monospace'
                    autosave        : 45
                    evaluate_key    : 'Shift-Enter'
                    passports       : []
                    groups          : []
                    last_active     : null
            set :
                all :
                    cmd  : 'getAll'
                    args : ['account_id']
                fields :
                    editor_settings : true
                    other_settings  : true
                    first_name      : true
                    last_name       : true
                    terminal        : true
                    autosave        : true
                    evaluate_key    : true

