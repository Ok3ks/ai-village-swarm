import { useState } from "react";
import { fetchTree } from "../lib/api";
import { classifyTurns, type ClassifyResult } from "../lib/llm";
import type { TranscriptSummary, Turn } from "../lib/types";

interface Props {
  selectedRows: TranscriptSummary[];
  onClear: () => void;
  onSummarize: (turns: Turn[], label: string) => void;
}

function parseCategories(input: string): string[] {
  return Array.from(new Set(input.split(",").map((c) => c.trim()).filter(Boolean)));
}

export function EventBatchBar({ selectedRows, onClear, onSummarize }: Props) {
  const [fetchingForSummarize, setFetchingForSummarize] = useState(false);
  const [fetchError, setFetchError] = useState<{ name: string; message: string } | null>(null);

  const [categoriesInput, setCategoriesInput] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<ClassifyResult | null>(null);
  const [classifyError, setClassifyError] = useState<{ name: string; message: string } | null>(null);

  const categories = parseCategories(categoriesInput);

  const handleSummarize = async () => {
    setFetchingForSummarize(true);
    setFetchError(null);
    try {
      const trees = await Promise.all(selectedRows.map((r) => fetchTree(r)));
      onSummarize(
        trees.map((t) => t.root),
        `Summarize ${selectedRows.length} selected event(s)`
      );
    } catch (e) {
      setFetchError({
        name: e instanceof Error ? e.name : "Error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setFetchingForSummarize(false);
    }
  };

  const handleClassify = async () => {
    setClassifying(true);
    setClassifyResult(null);
    setClassifyError(null);
    try {
      const trees = await Promise.all(selectedRows.map((r) => fetchTree(r)));
      const turns = trees.map((t) => t.root);
      const r = await classifyTurns(turns, categories);
      setClassifyResult(r);
    } catch (e) {
      setClassifyError({
        name: e instanceof Error ? e.name : "Error",
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setClassifying(false);
    }
  };

  if (selectedRows.length === 0) return null;

  const previewById = new Map(selectedRows.map((r) => [r.id, r.preview]));

  return (
    <div className="event-batch-bar">
      <div className="summarize-bar">
        <span className="muted small">{selectedRows.length} event(s) selected</span>
        <button
          className="summarize-btn"
          disabled={fetchingForSummarize || selectedRows.length <= 1}
          title={selectedRows.length <= 1 ? "Select more than one event to summarize" : undefined}
          onClick={handleSummarize}
        >
          {fetchingForSummarize ? "Loading…" : "Summarize selected"}
        </button>
        <button
          className="expand-btn"
          onClick={() => {
            setFetchError(null);
            setClassifyResult(null);
            setClassifyError(null);
            onClear();
          }}
        >
          Clear selection
        </button>
      </div>

      <div className="classify-bar">
        <input
          type="text"
          className="classify-categories"
          placeholder="Categories to classify into, comma-separated (e.g. benign, prompt-injection, collusion)"
          value={categoriesInput}
          onChange={(e) => setCategoriesInput(e.target.value)}
        />
        <button
          className="summarize-btn"
          disabled={classifying || categories.length === 0 || selectedRows.length <= 1}
          onClick={handleClassify}
          title={
            selectedRows.length <= 1
              ? "Select more than one event to classify"
              : categories.length === 0
                ? "Enter at least one category"
                : undefined
          }
        >
          {classifying ? "Classifying…" : "Classify selected"}
        </button>
      </div>

      {fetchError && (
        <div className="summary-card error">
          <div className="turn-header">
            <span className="turn-role">LLM ERROR</span>
            <span className="turn-id">{fetchError.name}</span>
            <button className="copy-btn" onClick={() => setFetchError(null)}>
              dismiss
            </button>
          </div>
          <pre className="turn-text">{fetchError.message}</pre>
        </div>
      )}

      {classifyError && (
        <div className="summary-card error">
          <div className="turn-header">
            <span className="turn-role">LLM ERROR</span>
            <span className="turn-id">{classifyError.name}</span>
            <button className="copy-btn" onClick={() => setClassifyError(null)}>
              dismiss
            </button>
          </div>
          <pre className="turn-text">{classifyError.message}</pre>
        </div>
      )}

      {classifyResult && (
        <div className="summary-card">
          <div className="turn-header">
            <span className="turn-role">BATCH LLM CLASSIFICATION</span>
            <span className="turn-id">{classifyResult.model}</span>
            <span className="turn-cite">{Math.round(classifyResult.tookMs)}ms</span>
            <button className="copy-btn" onClick={() => setClassifyResult(null)}>
              dismiss
            </button>
          </div>
          <table className="classify-table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Label</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              {classifyResult.items.map((item) => (
                <tr key={item.id}>
                  <td className="classify-event-cell" title={item.id}>
                    {previewById.get(item.id) || item.id}
                  </td>
                  <td>
                    <span className="tag">{item.label}</span>
                  </td>
                  <td>{item.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
