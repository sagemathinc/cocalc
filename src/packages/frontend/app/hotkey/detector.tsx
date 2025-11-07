/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { IS_MACOS } from "@cocalc/frontend/feature";
import { useEffect, useRef } from "react";

export type HotkeyType = "shift+shift" | "alt+shift+h" | "alt+shift+space";

/**
 * Hook to detect double-Shift key press (two Shift keys within delayMs)
 * Calls onDoubleShift when detected
 *
 * Usage:
 *   useShiftShiftDetector(() => {
 *     // Open quick navigation dialog
 *   }, enabled, 300, false); // 300ms delay, not blocked
 */
export function useShiftShiftDetector(
  onDoubleShift: () => void,
  enabled: boolean = true,
  delayMs: number = 300,
  blocked: boolean = false,
): void {
  const lastShiftTimeRef = useRef<number>(0);
  const shiftCountRef = useRef<number>(0);
  const resetTimerRef = useRef<NodeJS.Timeout | null>(null);

  function handleKeyDown(e: KeyboardEvent) {
    // Only listen for Shift key
    if (e.key !== "Shift") {
      // Reset counter on any other key
      shiftCountRef.current = 0;
      return;
    }

    // If another listener (like test detector) has already handled this, skip it
    if (e.defaultPrevented) {
      return;
    }

    // Clear any pending reset timer
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
    }

    // Use performance.now() for higher precision timing (microseconds vs milliseconds)
    const now = performance.now();
    const timeSinceLastShift = now - lastShiftTimeRef.current;

    // Check if this Shift is within delayMs of the last one
    if (timeSinceLastShift <= delayMs && timeSinceLastShift > 0) {
      // Double Shift detected!
      if (!blocked) {
        onDoubleShift();
      }
      // Reset to prepare for next double-Shift detection
      shiftCountRef.current = 0;
      lastShiftTimeRef.current = now; // Keep current timestamp so next Shift is measured against it
      return;
    }

    // Update timestamp for this Shift key
    lastShiftTimeRef.current = now;
    shiftCountRef.current += 1;

    // Reset counter after (delayMs * 2) of no activity to prepare for next double-Shift
    resetTimerRef.current = setTimeout(() => {
      shiftCountRef.current = 0;
      lastShiftTimeRef.current = 0; // Only reset to 0 if no activity for a while
      resetTimerRef.current = null;
    }, delayMs * 2);
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Add event listener with capture phase to catch key events early
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      // Clean up any pending reset timer
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [onDoubleShift, enabled, delayMs, blocked]);
}

/**
 * Hook to detect Alt+Shift+<key> (or Cmd+Shift+<key> on Mac)
 * Matches exact key or key.toLowerCase() if caseInsensitive is true
 */
function useAltShiftKeyDetector(
  onTriggered: () => void,
  targetKey: string,
  caseInsensitive: boolean = false,
  enabled: boolean = true,
): void {
  function handleKeyDown(e: KeyboardEvent) {
    const altKey = IS_MACOS ? e.metaKey : e.altKey;
    const keyMatches = caseInsensitive
      ? e.key.toLowerCase() === targetKey.toLowerCase()
      : e.key === targetKey;

    if (altKey && e.shiftKey && keyMatches) {
      e.preventDefault();
      e.stopPropagation();
      onTriggered();
    }
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onTriggered, enabled, targetKey, caseInsensitive]);
}

/**
 * Hook to detect Alt+Shift+H (or Cmd+Shift+H on Mac)
 */
export function useAltShiftHDetector(
  onTriggered: () => void,
  enabled: boolean = true,
): void {
  useAltShiftKeyDetector(onTriggered, "h", true, enabled);
}

/**
 * Hook to detect Alt+Shift+Space (or Cmd+Shift+Space on Mac)
 */
export function useAltShiftSpaceDetector(
  onTriggered: () => void,
  enabled: boolean = true,
): void {
  useAltShiftKeyDetector(onTriggered, " ", false, enabled);
}

/**
 * Global hotkey detector component
 * Place this at app shell level to detect hotkey anywhere
 *
 * Props:
 *   hotkey: Which hotkey to detect ("shift+shift", "alt+shift+h", or "disabled")
 *   onTriggered: Callback when hotkey is detected
 *   delayMs: Delay threshold in milliseconds for shift+shift (default: 50ms)
 *   blocked: Temporarily block the hotkey from triggering (e.g., during testing)
 */
export function GlobalHotkeyDetector({
  hotkey = "shift+shift",
  onTriggered,
  delayMs = 50,
  blocked = false,
}: {
  hotkey?: HotkeyType | "disabled";
  onTriggered: () => void;
  delayMs?: number;
  blocked?: boolean;
}): null {
  const isEnabled = hotkey !== "disabled";

  useShiftShiftDetector(
    onTriggered,
    isEnabled && hotkey === "shift+shift",
    delayMs,
    blocked,
  );
  useAltShiftHDetector(onTriggered, isEnabled && hotkey === "alt+shift+h");
  useAltShiftSpaceDetector(
    onTriggered,
    isEnabled && hotkey === "alt+shift+space",
  );

  return null;
}

export default GlobalHotkeyDetector;
