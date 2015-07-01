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
    stats :
        primary_key: 'id'
        anonymous : true   # allow user access, even if not signed in
        fields:
            id : true
            timestamp : true
            accounts : true
            projects : true
            active_projects : true
            last_day_projects : true
            last_week_projects : true
            last_month_projects : true
            hub_servers : true
        indexes:
            timestamp : []
        user_query:
            get:
                all :
                    cmd  : 'between'
                    args : (obj) ->
                        [new Date(new Date() - 1000*60*60), (->obj.this.r.maxval), {index:'timestamp'}]
                fields :
                    id : true
                    timestamp : true
                    accounts : true
                    projects : true
                    active_projects : true
                    last_day_projects : true
                    last_week_projects : true
                    last_month_projects : true
                    hub_servers : true
    file_use:
        primary_key: 'id'
        fields:
            id         : true
            project_id : true
            path       : true
            users      : true
            last_edited : true
        user_query:
            get :
                all :
                    cmd  : 'getAll'
                    args : ['all_projects_read', index:'project_id']
                fields :
                    id         : true
                    project_id : true
                    path       : true
                    users      : true
                    last_edited : true
            set :
                fields :
                    id : (obj) -> misc_node.sha1("#{obj.project_id}#{obj.path}")
                    project_id : 'project_write'
                    path       : true
                    users      : true
                    last_edited : true

    projects:
        primary_key: 'project_id'
        fields :
            project_id  : true
            title       : true
            description : true
            users       : true
            files       : true
            deleted     : true
        indexes :
            users : ["that.r.row('users').keys()", {multi:true}]
        user_query:
            get :
                all :
                    cmd  : 'getAll'
                    args : ['account_id', index:'users']
                fields :
                    project_id  : true
                    title       : true
                    description : true
                    users       : true
                    last_edited : true
            set :
                fields :
                    project_id  : 'all_projects_write'
                    title       : true
                    description : true
    accounts:
        primary_key : 'account_id'
        user_query :
            get :
                all :
                    cmd  : 'getAll'
                    args : ['account_id']
                fields :
                    account_id : true
                    email_address : true
                    editor_settings : true
                    other_settings : true
                    first_name : true
                    last_name : true
                    terminal  : true
                    autosave  : true
                    evaluate_key : true
                    passports : true
            set :
                all :
                    cmd  : 'getAll'
                    args : ['account_id']
                fields :
                    editor_settings : true
                    other_settings : true
                    first_name : true
                    last_name : true
                    terminal  : true
                    autosave  : true
                    evaluate_key : true

