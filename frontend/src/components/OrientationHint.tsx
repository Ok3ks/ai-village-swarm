import { useState } from "react";

export function OrientationHint() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="orientation-hint" role="status">
      <span>↻ This app is dense with data — rotate your device or widen the window for a better view.</span>
      <button className="copy-btn" onClick={() => setDismissed(true)}>
        dismiss
      </button>
    </div>
  );
}
