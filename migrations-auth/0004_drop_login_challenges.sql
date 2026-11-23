-- Migration number: 0004 	 2026-11-23
-- The emailed sign-in code step was removed again (the owner's choice): a password is
-- enough to sign in, and the emailed code is used only to set or reset a password.
-- The table from 0003 is no longer used.

DROP TABLE IF EXISTS login_challenges;
