import type { TranscriptSummary } from "../lib/types";

export function MetadataPanel({ summary }: { summary: TranscriptSummary | null }) {
  if (!summary) {
    return (
      <aside className="metadata-panel">
        <h2>Metadata</h2>
        <p className="muted">Nothing selected.</p>
      </aside>
    );
  }

  const tags = summary.tags ?? [];

  return (
    <aside className="metadata-panel">
      <h2>Metadata</h2>
      <dl>
        <dt>ID</dt>
        <dd>{summary.id}</dd>
        {summary.cite && (
          <>
            <dt>Cite</dt>
            <dd>{summary.cite}</dd>
          </>
        )}
        {summary.agentId && (
          <>
            <dt>Agent ID</dt>
            <dd>{summary.agentId}</dd>
          </>
        )}
        {summary.startTime && (
          <>
            <dt>Time range</dt>
            <dd>
              {summary.startTime} → {summary.endTime}
            </dd>
          </>
        )}
        <dt>Turns</dt>
        <dd>{summary.turnCount}</dd>
        <dt>Kind counts</dt>
        <dd>
          {Object.keys(summary.kindCounts).length === 0
            ? "none captured"
            : Object.entries(summary.kindCounts)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")}
        </dd>
        {tags.length > 0 && (
          <>
            <dt>Tags</dt>
            <dd>
              {tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      <p className="muted small">
        {summary.file
          ? "Source: ai_village.db claude_code_messages, grouped by sdk_session_id and split at >15min gaps between messages."
          : 'Source: swarmtraces.org redacted payload corpus — reconstructed attack requests ("payload") and their captured effects ("response" / "recovered_text"), linked by parent_id.'}
      </p>
    </aside>
  );
}
