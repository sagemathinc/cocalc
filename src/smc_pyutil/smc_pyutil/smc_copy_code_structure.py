#!/usr/bin/python
"""
(c) William Stein, 2013


"""

import json, os, subprocess, sys, uuid

def copy_code_structure(path, example, replace_what, replace_with):
    with open(path, 'r') as f:
        code = f.read()
    
    # find the code we're going to copy
    example_index = code.find(example)
    our_copy = example.replace(replace_what, replace_with)
    code = code[:example_index+len(example)] + our_copy + code[example_index+len(example):]
    
    with open(path, 'w') as f:
        f.write(code)

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('path')
    parser.add_argument('example')
    parser.add_argument('replace_what')
    parser.add_argument('replace_with')
    copy_code_structure(args.path, args.example, args.replace_what, args.replace_with)

if __name__ == "__main__":
    main()

