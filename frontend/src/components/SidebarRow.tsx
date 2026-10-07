import type { ReactNode } from "react";
import { onActivateKey } from "../lib/a11y";

interface Badge {
  key: string;
  label: ReactNode;
  className?: string;
}

interface Props {
  selected: boolean;
  laneColor: string;
  title: ReactNode;
  badges?: Badge[];
  preview: ReactNode;
  onClick: () => void;
  checkbox?: { checked: boolean; onChange: () => void; title?: string };
}

export function SidebarRow({ selected, laneColor, title, badges, preview, onClick, checkbox }: Props) {
  return (
    <li
      className={`timeline-item ${selected ? "selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onKeyDown={onActivateKey(onClick)}
    >
      {checkbox && (
        <input
          type="checkbox"
          className="turn-select"
          checked={checkbox.checked}
          onClick={(e) => e.stopPropagation()}
          onChange={checkbox.onChange}
          title={checkbox.title}
        />
      )}
      <div className="rail">
        <span className="rail-line" style={{ background: laneColor }} />
        <span className="rail-dot" style={{ background: laneColor, borderColor: laneColor }} />
      </div>
      <div className="row-body">
        <div className="row-top">
          <span className="row-id">{title}</span>
          {badges && badges.length > 0 && (
            <span className="row-badges">
              {badges.map((b) => (
                <span key={b.key} className={`badge ${b.className ?? ""}`}>
                  {b.label}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="row-preview">{preview}</div>
      </div>
    </li>
  );
}
