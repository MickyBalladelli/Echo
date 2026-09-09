ALTER TABLE post_polls
  ADD COLUMN hide_results_until_voted INTEGER NOT NULL DEFAULT 0;
