/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import React, { useEffect, useRef, useState } from "react";
import { COLORS } from "@cocalc/util/theme";
import { useAppContext } from "@cocalc/frontend/app/context";

interface HotkeyDelayTestProps {
  delayMs: number;
}

/**
 * Test component for double-Shift hotkey detection
 *
 * Allows users to verify that their hotkey delay setting works correctly.
 * When focused, it listens to Shift presses and indicates when a double-Shift
 * is detected within the configured delay.
 */
export const HotkeyDelayTest: React.FC<HotkeyDelayTestProps> = ({
  delayMs,
}) => {
  const { setBlockShiftShiftHotkey } = useAppContext();
  const [isActive, setIsActive] = useState(false);
  const [testResult, setTestResult] = useState<
    "waiting" | "detected" | "failed"
  >("waiting");
  const lastShiftTimeRef = useRef<number>(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Set block flag when test becomes active, unblock when inactive
    setBlockShiftShiftHotkey?.(isActive);

    if (!isActive) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only listen for Shift key
      if (e.key !== "Shift") {
        return;
      }

      const now = Date.now();
      const timeSinceLastShift = now - lastShiftTimeRef.current;

      // Check if this Shift is within delayMs of the last one
      if (timeSinceLastShift <= delayMs && timeSinceLastShift > 0) {
        // Double Shift detected! Prevent it from bubbling to the global detector
        e.preventDefault();
        e.stopPropagation();

        setTestResult("detected");
        lastShiftTimeRef.current = 0;

        // Reset after 1 second to show success state
        const timer = setTimeout(() => {
          setTestResult("waiting");
        }, 1000);

        return () => clearTimeout(timer);
      }

      // Record this Shift press
      lastShiftTimeRef.current = now;

      // Reset counter after delayMs * 2
      const resetTimer = setTimeout(() => {
        lastShiftTimeRef.current = 0;
      }, delayMs * 2);

      return () => clearTimeout(resetTimer);
    };

    // Use capture phase to catch Shift key early
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      // Ensure we unblock when component unmounts or isActive becomes false
      setBlockShiftShiftHotkey?.(false);
    };
  }, [isActive, delayMs, setBlockShiftShiftHotkey]);

  const getButtonStyle = (): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      fontWeight: 500,
      minWidth: 100,
    };

    switch (testResult) {
      case "waiting":
        return {
          ...baseStyle,
          backgroundColor: isActive ? COLORS.ANTD_BLUE : COLORS.GRAY_LL,
          color: isActive ? "white" : COLORS.GRAY_M,
          borderColor: isActive ? COLORS.ANTD_BLUE : COLORS.GRAY_L,
        };
      case "detected":
        return {
          ...baseStyle,
          backgroundColor: COLORS.ANTD_SUCCESS_GREEN,
          color: "white",
          borderColor: COLORS.ANTD_SUCCESS_GREEN,
        };
      case "failed":
        return {
          ...baseStyle,
          backgroundColor: COLORS.ANTD_ERROR_RED,
          color: "white",
          borderColor: COLORS.ANTD_ERROR_RED,
        };
    }
  };

  const getButtonLabel = (): string => {
    if (!isActive) {
      return "Test Hotkey";
    }
    switch (testResult) {
      case "waiting":
        return "Press Shift Twice";
      case "detected":
        return "✓ Detected!";
      case "failed":
        return "✗ Try Again";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "flex-start",
      }}
    >
      <Button
        ref={buttonRef}
        style={getButtonStyle()}
        onClick={() => {
          setIsActive(!isActive);
          setTestResult("waiting");
          lastShiftTimeRef.current = 0;
        }}
      >
        {getButtonLabel()}
      </Button>
      <span style={{ color: COLORS.GRAY_M, fontSize: 12 }}>
        {isActive
          ? `Press Shift twice within ${delayMs}ms`
          : "Click to test hotkey detection"}
      </span>
    </div>
  );
};

export default HotkeyDelayTest;
