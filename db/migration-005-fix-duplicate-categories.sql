USE `mdga_core-xTa5dfGz`;

-- Remove duplicate forum categories (keep the row with the lowest id for each name)
DELETE fc1 FROM forum_categories fc1
INNER JOIN forum_categories fc2
  ON fc1.name = fc2.name AND fc1.id > fc2.id;
