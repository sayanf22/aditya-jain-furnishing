-- Business details confirmed by the client (visiting card, October 2026).
-- Editable later from the admin dashboard.
INSERT INTO settings (key, value) VALUES
  ('business_name',  'Delta Furnishings'),
  ('legal_name',     'Delta Furnishings Pvt Ltd'),
  ('address_line1',  '77, First Floor, Furniture Block'),
  ('address_line2',  'Kirti Nagar, New Delhi 110015'),
  ('phone',          '+919811268268'),
  ('phone_display',  '+91 98112 68268'),
  ('gstin',          '07AAECD7008E1ZZ')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
