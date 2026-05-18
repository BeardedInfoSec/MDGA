-- migration-052: optional prize description on events. Free text so officers
-- can write anything from "200 gold" to "Boe set + 5k gold" or "Bragging rights".

ALTER TABLE events
  ADD COLUMN prize VARCHAR(255) NULL AFTER description;
