#!/usr/bin/env python
###############################################################################
#
# SageMathCloud: A collaborative web-based interface to Sage, IPython, LaTeX and the Terminal.
#
#    Copyright (C) 2014, William Stein
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



"""
Generate XML files for configuring the Zabbix monitoring system.

Reference: 
   www.zabbix.com/documentation/2.0/manual/xml_export_import
   http://lxml.de/tutorial.html
"""

import argparse, re
from lxml import etree

import zabbix_xml as zxml
from admin import parse_hosts_file


DEFAULT_HOSTS_FILE  = "./conf/deploy_cloud/hosts"
DEFAULT_OUTPUT_FILE = "zabbix_output.xml"


def generate_hosts(hosts_file = DEFAULT_HOSTS_FILE):

    host_list = parse_hosts_file(hosts_file)[1]
    group_names = ["cloud_vms"]

    root = zxml.root()

    for group_name in group_names:
        root.find("groups").append(zxml.group(group_name))

    for host_ip in host_list: 
        host_name = host_list[host_ip]

        # Determine the Zabbix template type by removing the numbers from
        # the hostname.
        base_name = re.split(r'(\d+)', host_name)[0]
        template  = "cloud_vm_" + base_name

        # Skip cloud* nodes since they are already monitored.
        if base_name == "cloud":
            continue
       
        root.find("hosts").append(zxml.host(hostname  = host_name, 
                                            ip        = host_ip,
                                            templates = ["cloud_vm_base", template],
                                            groups    = ["cloud_vms"]))

    return etree.ElementTree(root)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate Zabbix XML configuration files.")
    
    parser.add_argument("--output", "-o", default=DEFAULT_OUTPUT_FILE,
                    help="Name of output file.")

    parser.add_argument("--hosts", default=DEFAULT_HOSTS_FILE,
                    help="Generate host definitions from specified hosts file.")

    parser.add_argument("--raw", action="store_true", 
                    help="Disable formatting the XML output for readability.")

    args = parser.parse_args()

    # Generate the XML.
    xml_tree = generate_hosts(hosts_file=args.hosts)

    # Tidy formats the output XML for better readability. This is good for catching 
    # errors, so it's enabled by default. Print warning if it's not available.
    try:
        from tidylib import tidy_document
    except ImportError: 
        print "Warning: Unable to import tidylib, defaulting to raw mode. You may want to run\n  sudo apt-get install python-tidylib"    
        args.raw = True

    # Write the XML to a file.
    if args.raw == True:
        xml_tree.write(args.output, pretty_print=False)
    else:
        f = open(args.output, 'w')        
        document, errors = tidy_document(etree.tostring(xml_tree), options={"input-xml": 1, "output-xml": 1})
        f.write(document)
        f.close()

