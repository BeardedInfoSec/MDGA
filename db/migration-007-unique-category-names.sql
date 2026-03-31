USE `mdga_core-xTa5dfGz`;

-- Ensure no duplicate category names remain before adding constraint
DELETE fc1 FROM forum_categories fc1
INNER JOIN forum_categories fc2
  ON fc1.name = fc2.name AND fc1.id > fc2.id;

-- Prevent future duplicates at the database level
ALTER TABLE forum_categories ADD UNIQUE INDEX uq_category_name (name);
