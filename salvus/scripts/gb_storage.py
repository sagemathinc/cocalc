#!/usr/bin/env python

###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, 2015, William Stein
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

def log(s):
    print s

def open_project(project_id, quota):
    log("open_project(%s,%s)"%(project_id, quota))

def save_project(project_id, quota):
    log("save_project(%s,%s)"%(project_id, quota))


if __name__ == "__main__":

    import argparse
    parser = argparse.ArgumentParser(description="BTRFS-GoogleCloudStorage backed project storage subsystem")
    subparsers = parser.add_subparsers(help='sub-command help')

    parser_open = subparsers.add_parser('open', help='')
    parser_open.add_argument("--quota", help="quota in MB", dest="quota", default=0, type=int)
    parser_open.add_argument("project_id", help="", type=str)
    parser_open.set_defaults(func=lambda args: open_project(args.project_id, args.quota))

    parser_open = subparsers.add_parser('save', help='')
    parser_open.add_argument("--max", help="maximum number of snapshots", dest="max", default=0, type=int)
    parser_open.add_argument("project_id", help="", type=str)
    parser_open.set_defaults(func=lambda args: save_project(args.project_id, args.max))

    args = parser.parse_args()
    args.func(args)



