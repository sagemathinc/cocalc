/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details.
 */

/**
 * ARIA Keyboard Activation Handler
 *
 * This module provides utilities for making custom interactive elements
 * (divs, spans, etc. with role="button" or role="tab") fully accessible
 * to keyboard users.
 *
 * Why this is needed:
 * - Native HTML <button> elements work with Enter and Space keys automatically
 * - When using <div role="button"> (common with styled frameworks), keyboard
 *   support must be manually implemented
 * - This handler provides the standard keyboard behavior expected by assistive
 *   technology users and keyboard navigators
 *
 * Usage:
 *   <div
 *     role="button"
 *     tabIndex={0}
 *     onClick={handleClick}
 *     onKeyDown={(e) => ariaKeyDown(e, handleClick)}
 *   >
 *     Click me or press Enter/Space
 *   </div>
 *
 * Benefits:
 * - Consistent keyboard behavior across custom interactive components
 * - Works with Enter key (standard for buttons) and Space (acceptable alternative)
 * - Prevents default browser behavior (e.g., page scroll on Space)
 * - Single source of truth for this common accessibility pattern
 *
 * @param handler - The click handler to invoke (typically your onClick function)
 * @param stopPropagation - Whether to prevent event bubbling (default: true)
 * @returns A keyboard event handler function
 *
 * @example
 * // In your component:
 * <div
 *   role="button"
 *   tabIndex={0}
 *   onClick={handleDelete}
 *   onKeyDown={ariaKeyDown(handleDelete)}
 * >
 *   Delete
 * </div>
 */
export function ariaKeyDown(
  handler: (e?: React.KeyboardEvent | React.MouseEvent) => void,
  stopPropagation: boolean = true,
): (e: React.KeyboardEvent) => void {
  return (e: React.KeyboardEvent) => {
    // Activate on Enter (standard button behavior) or Space (accessible alternative)
    if (e.key === "Enter" || e.key === " ") {
      // Prevent default browser behavior:
      // - Enter: prevents form submission or other default actions
      // - Space: prevents page scroll
      e.preventDefault();
      // Stop event bubbling to parent elements (default: true)
      // This prevents parent handlers from also triggering
      if (stopPropagation) {
        e.stopPropagation();
      }
      // Call the handler (usually onClick)
      handler(e);
    }
  };
}
