#!/usr/bin/env python3
"""
Analyze pnpm-lock.yaml for duplicate packages with different versions.
"""

import re
import sys
from collections import defaultdict
from packaging import version
import yaml

def parse_pnpm_lock(file_path):
    """Parse pnpm-lock.yaml and extract package versions."""
    try:
        with open(file_path, 'r') as f:
            data = yaml.safe_load(f)
    except FileNotFoundError:
        print(f"Error: {file_path} not found")
        return None
    except yaml.YAMLError as e:
        print(f"Error parsing YAML: {e}")
        return None
    
    packages = {}
    
    # Extract from packages section
    if 'packages' in data:
        for pkg_spec, pkg_info in data['packages'].items():
            # Parse package name and version from spec like "package@1.0.0"
            match = re.match(r'^(.+?)@([^@]+)$', pkg_spec)
            if match:
                name, ver = match.groups()
                if name not in packages:
                    packages[name] = []
                packages[name].append(ver)
    
    return packages

def find_duplicates(packages):
    """Find packages with multiple versions."""
    duplicates = {}
    
    for name, versions in packages.items():
        if len(set(versions)) > 1:  # More than one unique version
            unique_versions = sorted(set(versions), key=lambda v: version.parse(v) if is_valid_version(v) else version.parse("0.0.0"))
            duplicates[name] = {
                'versions': unique_versions,
                'count': len(versions),
                'unique_count': len(unique_versions)
            }
    
    return duplicates

def is_valid_version(ver_str):
    """Check if version string is valid semver."""
    try:
        version.parse(ver_str)
        return True
    except version.InvalidVersion:
        return False

def analyze_version_differences(versions):
    """Analyze how different the versions are."""
    if len(versions) < 2:
        return "single"
    
    try:
        parsed_versions = [version.parse(v) for v in versions if is_valid_version(v)]
        if len(parsed_versions) < 2:
            return "invalid"
        
        parsed_versions.sort()
        
        # Check if only patch versions differ
        major_minor_same = all(
            (v.major, v.minor) == (parsed_versions[0].major, parsed_versions[0].minor) 
            for v in parsed_versions
        )
        if major_minor_same:
            return "patch_diff"
        
        # Check if only minor versions differ (same major)
        major_same = all(v.major == parsed_versions[0].major for v in parsed_versions)
        if major_same:
            return "minor_diff"
        
        return "major_diff"
        
    except Exception:
        return "unknown"

def main():
    lock_file = "packages/pnpm-lock.yaml"
    
    print("Analyzing pnpm-lock.yaml for duplicate packages...")
    
    packages = parse_pnpm_lock(lock_file)
    if packages is None:
        sys.exit(1)
    
    duplicates = find_duplicates(packages)
    
    if not duplicates:
        print("No duplicate packages found!")
        return
    
    print(f"\nFound {len(duplicates)} packages with multiple versions:\n")
    
    # Group by difference type
    by_diff_type = defaultdict(list)
    
    for name, info in duplicates.items():
        diff_type = analyze_version_differences(info['versions'])
        by_diff_type[diff_type].append((name, info))
    
    # Report patch differences first (most concerning)
    if 'patch_diff' in by_diff_type:
        print("🔴 PATCH VERSION DIFFERENCES (most concerning):")
        print("=" * 50)
        for name, info in sorted(by_diff_type['patch_diff']):
            versions_str = " vs ".join(info['versions'])
            print(f"  {name}: {versions_str} ({info['count']} total installations)")
        print()
    
    if 'minor_diff' in by_diff_type:
        print("🟡 MINOR VERSION DIFFERENCES:")
        print("=" * 30)
        for name, info in sorted(by_diff_type['minor_diff']):
            versions_str = " vs ".join(info['versions'])
            print(f"  {name}: {versions_str} ({info['count']} total installations)")
        print()
    
    if 'major_diff' in by_diff_type:
        print("🟠 MAJOR VERSION DIFFERENCES (expected for breaking changes):")
        print("=" * 60)
        for name, info in sorted(by_diff_type['major_diff'])[:10]:  # Limit to 10
            versions_str = " vs ".join(info['versions'])
            print(f"  {name}: {versions_str} ({info['count']} total installations)")
        if len(by_diff_type['major_diff']) > 10:
            print(f"  ... and {len(by_diff_type['major_diff']) - 10} more")
        print()
    
    # Summary
    total_patch = len(by_diff_type['patch_diff'])
    total_minor = len(by_diff_type['minor_diff'])
    
    print("SUMMARY:")
    print(f"  🔴 Patch differences: {total_patch} (should be unified)")
    print(f"  🟡 Minor differences: {total_minor} (may need review)")
    print(f"  🟠 Major differences: {len(by_diff_type['major_diff'])} (usually expected)")

if __name__ == "__main__":
    main()