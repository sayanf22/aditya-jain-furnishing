-- Migration number: 0002 	 2026-11-23
-- Abuse limits for the public form. ip_hash is a keyed hash of the visitor's address (never the
-- address itself), so a visitor can be limited per hour and per day without storing who they are.
-- fingerprint is a keyed hash of phone + message, so the same enquiry sent twice is stored once.
ALTER TABLE enquiries ADD COLUMN ip_hash TEXT;
ALTER TABLE enquiries ADD COLUMN fingerprint TEXT;
CREATE INDEX idx_enquiries_ip ON enquiries(ip_hash, created_at);
CREATE INDEX idx_enquiries_fingerprint ON enquiries(fingerprint, created_at);
