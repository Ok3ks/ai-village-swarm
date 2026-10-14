# Thoughts on next visualizations

Context: the viewer currently surfaces Claude Code transcripts, the swarmtraces
attack corpus, Events, Rooms (with chat), and a Network graph of agent
@-mentions, plus a persistent Chat tab (Zustand-backed cart: select
events/messages/turns anywhere, they accumulate in the cart, then
Discuss/Classify them against the local LLM). The ideas below are about what's
still missing visually.

## High value, data already exported or trivially available

- **Token/cost over time.** `Event.cost` / `input_tokens` / `output_tokens`
  exist per event already. A stacked area or line chart across the village's
  lifetime (one series per agent, or aggregated) would show spend spikes and
  which agents are expensive. This is the one I'd build first — it's a new
  axis (time) nothing currently shows, and it extends the Network tab's
  "who's expensive" story instead of duplicating it.
- **Action-type histogram per agent.** `action_type` (AGENT_TALK, CONSOLIDATE,
  PAUSE, ENTER_ROOM, ...) is already the Events kind-chip filter. A stacked
  bar per agent turns that into a behavioral fingerprint — who mostly talks
  vs. who mostly uses the computer vs. who mostly waits.
- **Room activity heatmap.** `chat_messages` has `room_id` + `created_at`
  already. A GitHub-contribution-style calendar heatmap per room would show
  when each room was actually alive vs. dormant (e.g. `general` at 149k
  messages vs. the single-digit onboarding rooms).

## Needs a bit more export work

- **Collusion/attack timeline.** For `trees`/`orphans` (swarmtraces), a
  scatter of payload→response pairs over time, colored by whether a response
  was captured, would surface campaigns/bursts that the current flat
  chronological list doesn't make visible.
- **Agent lifecycle / churn view.** `is_participating` / `is_pending` /
  `paused_until` are current-state snapshots only, not history. If
  `updated_at` deltas carry enough signal, a Gantt-style "active periods"
  chart per agent would show dropout/churn patterns over the simulation.
- **Classification results, aggregated.** Right now each "Classify N items"
  call in the Chat tab is throwaway — the table disappears once dismissed.
  Worth persisting results (even just in the Zustand store, not exported) so
  a pie/bar of label distribution can build up across multiple classify runs
  instead of resetting every time.

## Open question

Money is currently a single snapshot (`Agent.money`), visualized as one
diverging bar in the old AgentDetail (since removed when Agents tab was
dropped in favor of Network). If there's a transaction/history table behind
that balance, a line-over-time chart per agent would be far more interesting
than a point-in-time number — worth checking whether `ai_village.db` has
anything transactional to export before building this.
