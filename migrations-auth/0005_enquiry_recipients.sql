-- Migration number: 0005 	 2026-11-23
-- Who gets an email about a new website enquiry. Chosen in the dashboard (Security -> Enquiry emails);
-- a person added later gets none until someone ticks them. People who exist today keep getting
-- the emails, so nothing changes until the owner chooses.
ALTER TABLE admin_users ADD COLUMN notify_enquiries INTEGER NOT NULL DEFAULT 0;
UPDATE admin_users SET notify_enquiries = 1 WHERE disabled = 0;
