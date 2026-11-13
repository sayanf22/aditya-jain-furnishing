-- New showroom number, confirmed by the client on 13 Nov 2026 for both
-- calls and WhatsApp: +91 92124 56021. It replaces 98112 68268
-- (0003_business_settings.sql). The WhatsApp number used to be a demo
-- assumption in seeds/demo-local.sql; it is confirmed now, so it lives here.
INSERT INTO settings (key, value) VALUES
  ('phone',           '+919212456021'),
  ('phone_display',   '+91 92124 56021'),
  ('whatsapp_number', '919212456021')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
