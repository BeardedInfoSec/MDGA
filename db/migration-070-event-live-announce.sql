-- migration-070: events.live_announced_at
--
-- Tracks whether the "event is live now" Discord post has already fired
-- so the live-event scheduler doesn't double-announce on each tick. NULL
-- means not yet announced; a timestamp means we already posted to the
-- events Discord channel (rapazzini forum #65, item 3).
--
-- Separate from kickoff_announced_at on giveaway_configs — that one is
-- about the giveaway lifecycle. This is about the event lifecycle.

ALTER TABLE events
  ADD COLUMN live_announced_at TIMESTAMP NULL DEFAULT NULL;

-- Index so the scheduler's "find events that just went live and haven't
-- been announced" query can hit an index instead of scanning the table.
CREATE INDEX idx_events_live_announce ON events(starts_at, live_announced_at);
