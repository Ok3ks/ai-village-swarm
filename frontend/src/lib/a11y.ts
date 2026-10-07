import type { KeyboardEvent } from "react";

// Lets non-<button>/<a> clickable elements (list rows, SVG nodes) respond to
// Enter/Space like a real button, for keyboard and screen-reader users.
export function onActivateKey(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
}
