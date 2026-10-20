-- MYT Pulse schema (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS batches (centre TEXT, batch TEXT, students INTEGER, active INTEGER DEFAULT 1, PRIMARY KEY (centre,batch));
CREATE TABLE IF NOT EXISTS people (name TEXT PRIMARY KEY, type TEXT, phone TEXT, pin TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS assignments (centre TEXT, batch TEXT, role TEXT, subject TEXT, person TEXT);
CREATE INDEX IF NOT EXISTS ix_asg ON assignments(centre,batch);
CREATE TABLE IF NOT EXISTS aliases (raw TEXT PRIMARY KEY, canon TEXT);
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, year INTEGER, ts TEXT, centre TEXT, batch TEXT,
  q1 REAL, q2 REAL, q3 REAL, comment TEXT, hidden INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_sub_year ON submissions(year);
CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, sid INTEGER, year INTEGER, centre TEXT, batch TEXT, role TEXT,
  person TEXT, subjects TEXT, r1 REAL, r2 REAL, r3 REAL, r4 REAL, r5 REAL, comment TEXT, hidden INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_rat_year ON ratings(year);
CREATE INDEX IF NOT EXISTS ix_rat_person ON ratings(person,year);
-- hidden: 0 visible, 1 hidden by admin/AI, 2 pending AI check
CREATE TABLE IF NOT EXISTS ratelimit (k TEXT PRIMARY KEY, n INTEGER);
CREATE TABLE IF NOT EXISTS summaries (person TEXT, role TEXT, year INTEGER, text TEXT, updated TEXT, PRIMARY KEY(person,role,year));
INSERT OR IGNORE INTO settings VALUES ('form_open','1'),('results_released','0'),('year','2026');
