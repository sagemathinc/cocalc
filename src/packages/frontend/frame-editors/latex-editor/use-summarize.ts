/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
LaTeX file summarization utilities for the LaTeX editor.
Provides functionality to generate summaries of LaTeX files using a Python script.
*/

// cSpell:ignore EOFPYTHON

import { List } from "immutable";
import { useCallback, useEffect, useState } from "react";

import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { path_split } from "@cocalc/util/misc";

const SUMMARIZE_TEX_FILES = `
import sys
import json
import re
import os

def clean_latex_text(text):
    """Remove LaTeX commands and clean up text for readability"""
    # Remove comments
    text = re.sub(r'%.*$', '', text, flags=re.MULTILINE)

    # Remove common LaTeX commands but preserve content
    text = re.sub(r'\\\\(title|author|section|subsection|subsubsection|chapter)\\{([^}]*)\\}', r'**\\2**', text)
    text = re.sub(r'\\\\(emph|textit)\\{([^}]*)\\}', r'_\\2_', text)
    text = re.sub(r'\\\\(textbf|textsc)\\{([^}]*)\\}', r'**\\2**', text)

    # Remove other LaTeX commands
    text = re.sub(r'\\\\[a-zA-Z]+\\*?\\{[^}]*\\}', '', text)
    text = re.sub(r'\\\\[a-zA-Z]+\\*?', '', text)

    # Remove LaTeX environments but keep content
    text = re.sub(r'\\\\begin\\{[^}]*\\}', '', text)
    text = re.sub(r'\\\\end\\{[^}]*\\}', '', text)

    # Remove excessive whitespace
    text = re.sub(r'\\n\\s*\\n', '\\n', text)
    text = re.sub(r'\\s+', ' ', text).strip()

    return text

def extract_summary(filepath, home_dir):
    """Extract a meaningful summary from a LaTeX file"""
    if not filepath.endswith(('.tex', '.latex')):
        return "Non-LaTeX file"

    # Handle different path formats
    if filepath.startswith('~/'):
        # Path starts with ~/ - replace ~ with home directory
        expanded_path = os.path.join(home_dir, filepath[2:])
    elif os.path.isabs(filepath):
        # Absolute path - use as is
        expanded_path = filepath
    else:
        # Relative path - join with home directory
        expanded_path = os.path.join(home_dir, filepath)

    if not os.path.exists(expanded_path):
        return f"File not found: {expanded_path}"

    try:
        with open(expanded_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"

    # Extract first meaningful content (skip documentclass, packages, etc.)
    lines = content.split('\\n')
    useful_lines = []
    in_preamble = True
    has_document_env = '\\\\begin{document}' in content

    for line in lines:
        line = line.strip()
        if not line or line.startswith('%'):
            continue

        # Check if we're past the preamble
        if '\\\\begin{document}' in line:
            in_preamble = False
            continue

        # For files without \\begin{document}, treat everything as content
        if not has_document_env:
            in_preamble = False

        if in_preamble:
            # Extract title, author from preamble
            if line.startswith('\\\\title{') or line.startswith('\\\\author{'):
                useful_lines.append(line)
        else:
            # Extract meaningful content
            if any(cmd in line for cmd in ['\\\\section', '\\\\subsection', '\\\\chapter', '\\\\subsubsection']):
                useful_lines.append(line)
            elif line and not line.startswith('\\\\') and len(line) > 3:  # Lowered threshold
                useful_lines.append(line)
            elif line.startswith('\\\\') and len(line) > 10:  # Include some LaTeX commands
                useful_lines.append(line)

        # Limit to first 15 useful lines
        if len(useful_lines) >= 15:
            break

    # If we found some useful content, use it
    if useful_lines:
        summary_text = '\\n'.join(useful_lines[:8])  # Use more lines
        cleaned = clean_latex_text(summary_text)
        if cleaned and len(cleaned.strip()) > 0:
            # Convert to single line and truncate if too long
            cleaned = ' '.join(cleaned.split())  # Remove all newlines and extra spaces
            if len(cleaned) > 400:
                cleaned = cleaned[:397] + "..."
            return cleaned

    # Fallback: show raw content (first 400 chars, cleaned)
    # Remove comments first
    raw_content = re.sub(r'%.*$', '', content, flags=re.MULTILINE)
    raw_content = ' '.join(raw_content.split())  # Convert to single line

    if len(raw_content) > 400:
        raw_content = raw_content[:397] + "..."

    return raw_content if raw_content else "LaTeX document"

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: script.py <home_dir> <file1> <file2> ..."}))
        return

    home_dir = sys.argv[1]
    results = {}

    for filepath in sys.argv[2:]:
        results[filepath] = extract_summary(filepath, home_dir)

    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    main()
`;

export interface TexSummaries {
  fileSummaries: Record<string, string>;
  summariesLoading: boolean;
  refreshSummaries: () => void;
}

/**
 * Hook to generate and manage LaTeX file summaries
 */
export function useTexSummaries(
  switch_to_files: List<string>,
  project_id: string,
  path: string,
  homeDir: string | null,
  reload?: number,
): TexSummaries {
  // File summaries state with caching (1 minute max)
  const [fileSummaries, setFileSummaries] = useState<Record<string, string>>(
    {},
  );
  const [lastSummariesFetch, setLastSummariesFetch] = useState<number>(0);
  const [summariesLoading, setSummariesLoading] = useState<boolean>(false);

  // Function to generate file summaries using Python script
  const generateFileSummaries = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!switch_to_files || switch_to_files.size === 0) return;

      const now = Date.now();
      const oneMinute = 60 * 1000;

      // Only update if it's been more than 1 minute since last fetch (unless forced)
      if (!forceRefresh && now - lastSummariesFetch < oneMinute) return;

      setSummariesLoading(true);

      try {
        // Execute Python script with file list as arguments
        const fileList = switch_to_files.toJS();

        // Write Python script to temporary file to avoid command line escaping issues
        const scriptPath = "/tmp/tex_summarizer.py";
        await exec({
          command: `cat > "${scriptPath}" << 'EOFPYTHON'\n${SUMMARIZE_TEX_FILES}\nEOFPYTHON`,
          project_id,
          path: path_split(path).head,
          timeout: 5,
        });

        // Use the pre-fetched home directory
        if (!homeDir) {
          console.warn("Home directory not available yet");
          return;
        }

        // The switch_to_files contains canonical paths relative to the project root
        // Pass the actual home directory to the Python script
        const result = await exec({
          command: "python3",
          args: [scriptPath, homeDir, ...fileList],
          project_id,
          path: path_split(path).head, // Run from current file's directory
          timeout: 30, // 30 second timeout
        });

        if (result.exit_code === 0 && result.stdout) {
          try {
            const summaries = JSON.parse(result.stdout);
            setFileSummaries(summaries);
          } catch (parseError) {
            console.warn("Failed to parse summary results:", parseError);
            // Fallback to basic summaries
            const fallbackSummaries: Record<string, string> = {};
            switch_to_files.forEach((filePath) => {
              fallbackSummaries[filePath] = "LaTeX document";
            });
            setFileSummaries(fallbackSummaries);
          }
        } else {
          console.warn(
            "Summary generation failed:",
            result.stderr ?? "Unknown error",
          );
          // Fallback to basic summaries
          const fallbackSummaries: Record<string, string> = {};
          switch_to_files.forEach((filePath) => {
            fallbackSummaries[filePath] = "LaTeX document";
          });
          setFileSummaries(fallbackSummaries);
        }
      } catch (error) {
        console.warn("Error generating summaries:", error);
        // Fallback to basic summaries
        const fallbackSummaries: Record<string, string> = {};
        switch_to_files.forEach((filePath) => {
          fallbackSummaries[filePath] = "LaTeX document";
        });
        setFileSummaries(fallbackSummaries);
      } finally {
        setLastSummariesFetch(now);
        setSummariesLoading(false);
      }
    },
    [switch_to_files, lastSummariesFetch, reload],
  );

  // Manual refresh function that bypasses the rate limiting
  const refreshSummaries = useCallback(
    () => generateFileSummaries(true),
    [generateFileSummaries],
  );

  // Generate file summaries when files change
  useEffect(() => {
    if (switch_to_files && switch_to_files.size > 1) {
      generateFileSummaries();
    }
  }, [switch_to_files, generateFileSummaries]);

  return {
    fileSummaries,
    summariesLoading,
    refreshSummaries,
  };
}
