-- ─────────────────────────────────────────────────────────────────
-- Fake-metrics seed  (safe to run multiple times – uses INSERT … ON CONFLICT)
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. Extra users ────────────────────────────────────────────────
INSERT INTO "User" (id, email, "passwordHash", "emailVerified", role, "displayName", "createdAt")
VALUES
  ('fake_u01', 'charlie@demo.com',  '$2b$10$fakehashfakehashfakeh.u01', true, 'USER', 'Charlie',   '2026-05-21 09:10:00'),
  ('fake_u02', 'diana@demo.com',    '$2b$10$fakehashfakehashfakeh.u02', true, 'USER', 'Diana',     '2026-05-21 14:32:00'),
  ('fake_u03', 'evan@demo.com',     '$2b$10$fakehashfakehashfakeh.u03', true, 'USER', 'Evan',      '2026-05-22 08:05:00'),
  ('fake_u04', 'fiona@demo.com',    '$2b$10$fakehashfakehashfakeh.u04', true, 'USER', 'Fiona',     '2026-05-22 17:20:00'),
  ('fake_u05', 'george@demo.com',   '$2b$10$fakehashfakehashfakeh.u05', true, 'USER', 'George',    '2026-05-23 10:00:00'),
  ('fake_u06', 'hannah@demo.com',   '$2b$10$fakehashfakehashfakeh.u06', true, 'USER', 'Hannah',    '2026-05-23 20:45:00'),
  ('fake_u07', 'ivan@demo.com',     '$2b$10$fakehashfakehashfakeh.u07', true, 'USER', 'Ivan',      '2026-05-24 11:30:00'),
  ('fake_u08', 'julia@demo.com',    '$2b$10$fakehashfakehashfakeh.u08', true, 'USER', 'Julia',     '2026-05-24 16:00:00'),
  ('fake_u09', 'kevin@demo.com',    '$2b$10$fakehashfakehashfakeh.u09', true, 'USER', 'Kevin',     '2026-05-25 09:22:00'),
  ('fake_u10', 'laura@demo.com',    '$2b$10$fakehashfakehashfakeh.u10', true, 'USER', 'Laura',     '2026-05-25 18:55:00'),
  ('fake_u11', 'mike@demo.com',     '$2b$10$fakehashfakehashfakeh.u11', true, 'USER', 'Mike',      '2026-05-26 07:40:00'),
  ('fake_u12', 'nina@demo.com',     '$2b$10$fakehashfakehashfakeh.u12', true, 'USER', 'Nina',      '2026-05-26 13:15:00'),
  ('fake_u13', 'oscar@demo.com',    '$2b$10$fakehashfakehashfakeh.u13', true, 'USER', 'Oscar',     '2026-05-27 10:30:00'),
  ('fake_u14', 'priya@demo.com',    '$2b$10$fakehashfakehashfakeh.u14', true, 'USER', 'Priya',     '2026-05-27 21:05:00'),
  ('fake_u15', 'quinn@demo.com',    '$2b$10$fakehashfakehashfakeh.u15', true, 'USER', 'Quinn',     '2026-05-28 12:00:00'),
  ('fake_u16', 'rachel@demo.com',   '$2b$10$fakehashfakehashfakeh.u16', true, 'USER', 'Rachel',    '2026-05-29 08:20:00'),
  ('fake_u17', 'sam@demo.com',      '$2b$10$fakehashfakehashfakeh.u17', true, 'USER', 'Sam',       '2026-05-30 15:45:00'),
  ('fake_u18', 'tina@demo.com',     '$2b$10$fakehashfakehashfakeh.u18', true, 'USER', 'Tina',      '2026-05-31 09:00:00'),
  ('fake_u19', 'umar@demo.com',     '$2b$10$fakehashfakehashfakeh.u19', true, 'USER', 'Umar',      '2026-06-01 11:30:00'),
  ('fake_u20', 'vera@demo.com',     '$2b$10$fakehashfakehashfakeh.u20', true, 'USER', 'Vera',      '2026-06-02 14:00:00'),
  ('fake_u21', 'will@demo.com',     '$2b$10$fakehashfakehashfakeh.u21', true, 'USER', 'Will',      '2026-06-03 16:20:00'),
  ('fake_u22', 'xena@demo.com',     '$2b$10$fakehashfakehashfakeh.u22', true, 'USER', 'Xena',      '2026-06-04 10:10:00'),
  ('fake_u23', 'yusuf@demo.com',    '$2b$10$fakehashfakehashfakeh.u23', true, 'USER', 'Yusuf',     '2026-06-04 18:55:00'),
  ('fake_u24', 'zoe@demo.com',      '$2b$10$fakehashfakehashfakeh.u24', true, 'USER', 'Zoe',       '2026-06-05 08:30:00')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Bump view counts on existing videos ─────────────────────────
UPDATE "Video" SET "viewCount" = 3847  WHERE id = 'seed_0';   -- Big Buck Bunny  (most popular)
UPDATE "Video" SET "viewCount" = 2134  WHERE id = 'seed_1';   -- Sintel
UPDATE "Video" SET "viewCount" = 1562  WHERE id = 'seed_2';   -- Tears of Steel
UPDATE "Video" SET "viewCount" = 2891  WHERE id = 'seed_3';   -- Elephants Dream
UPDATE "Video" SET "viewCount" = 743   WHERE id = 'seed_4';   -- For Bigger Joyrides
UPDATE "Video" SET "viewCount" = 218   WHERE id = 'seed_5';   -- Subaru (unlisted)
UPDATE "Video" SET "viewCount" = 982   WHERE id = 'a50d686d-4c79-4370-af31-56e169c75ceb'; -- Sanity Test
UPDATE "Video" SET "viewCount" = 461   WHERE id = '065282a9-3423-4d8c-9c3e-f828dd9dc688'; -- C7749 News
UPDATE "Video" SET "viewCount" = 155   WHERE id = '552f2ce7-bcc2-4ab2-bf7d-6e89586e5c91'; -- pub
UPDATE "Video" SET "viewCount" = 312   WHERE id = '5614c929-19b5-4303-861b-24a43b41ebec'; -- C7749 private
UPDATE "Video" SET "viewCount" = 88    WHERE id = '481f00f8-23e0-47a4-92d1-f7393ecc95d4'; -- 1 gaming
UPDATE "Video" SET "viewCount" = 47    WHERE id = 'bce7dd68-8e4c-4301-ad09-5242957983dc'; -- C7749 unlisted

-- ── 3. Watch history (user × video, skip existing) ────────────────
-- seed_0 (Big Buck Bunny) – many watchers, most completed
INSERT INTO "WatchHistory" (id, "userId", "videoId", "watchedAt", "positionSec", "completedAt")
VALUES
  ('wh_u01_s0', 'fake_u01', 'seed_0', '2026-05-21 09:30:00', 596, '2026-05-21 09:39:00'),
  ('wh_u02_s0', 'fake_u02', 'seed_0', '2026-05-21 14:50:00', 596, '2026-05-21 15:00:00'),
  ('wh_u03_s0', 'fake_u03', 'seed_0', '2026-05-22 08:20:00', 596, '2026-05-22 08:30:00'),
  ('wh_u04_s0', 'fake_u04', 'seed_0', '2026-05-22 17:35:00', 596, '2026-05-22 17:45:00'),
  ('wh_u05_s0', 'fake_u05', 'seed_0', '2026-05-23 10:15:00', 320, NULL),
  ('wh_u06_s0', 'fake_u06', 'seed_0', '2026-05-23 21:00:00', 596, '2026-05-23 21:10:00'),
  ('wh_u07_s0', 'fake_u07', 'seed_0', '2026-05-24 11:45:00', 596, '2026-05-24 11:55:00'),
  ('wh_u08_s0', 'fake_u08', 'seed_0', '2026-05-24 16:20:00', 450, NULL),
  ('wh_u09_s0', 'fake_u09', 'seed_0', '2026-05-25 09:40:00', 596, '2026-05-25 09:50:00'),
  ('wh_u10_s0', 'fake_u10', 'seed_0', '2026-05-25 19:10:00', 596, '2026-05-25 19:20:00'),
  ('wh_u11_s0', 'fake_u11', 'seed_0', '2026-05-26 08:00:00', 596, '2026-05-26 08:10:00'),
  ('wh_u12_s0', 'fake_u12', 'seed_0', '2026-05-26 13:30:00', 596, '2026-05-26 13:40:00'),
  ('wh_u13_s0', 'fake_u13', 'seed_0', '2026-05-27 10:45:00', 180, NULL),
  ('wh_u14_s0', 'fake_u14', 'seed_0', '2026-05-27 21:20:00', 596, '2026-05-27 21:30:00'),
  ('wh_u15_s0', 'fake_u15', 'seed_0', '2026-05-28 12:15:00', 596, '2026-05-28 12:25:00'),
  ('wh_u16_s0', 'fake_u16', 'seed_0', '2026-05-29 08:35:00', 596, '2026-05-29 08:45:00'),
  ('wh_u17_s0', 'fake_u17', 'seed_0', '2026-05-30 16:00:00', 596, '2026-05-30 16:10:00'),
  ('wh_u18_s0', 'fake_u18', 'seed_0', '2026-05-31 09:15:00', 596, '2026-05-31 09:25:00'),
  ('wh_u19_s0', 'fake_u19', 'seed_0', '2026-06-01 11:45:00', 596, '2026-06-01 11:55:00'),
  ('wh_u20_s0', 'fake_u20', 'seed_0', '2026-06-02 14:15:00', 596, '2026-06-02 14:25:00'),
-- seed_1 (Sintel)
  ('wh_u01_s1', 'fake_u01', 'seed_1', '2026-05-21 10:00:00', 888, '2026-05-21 10:15:00'),
  ('wh_u03_s1', 'fake_u03', 'seed_1', '2026-05-22 09:00:00', 888, '2026-05-22 09:15:00'),
  ('wh_u05_s1', 'fake_u05', 'seed_1', '2026-05-23 11:00:00', 600, NULL),
  ('wh_u07_s1', 'fake_u07', 'seed_1', '2026-05-24 12:30:00', 888, '2026-05-24 12:45:00'),
  ('wh_u09_s1', 'fake_u09', 'seed_1', '2026-05-25 10:00:00', 888, '2026-05-25 10:15:00'),
  ('wh_u11_s1', 'fake_u11', 'seed_1', '2026-05-26 09:00:00', 888, '2026-05-26 09:15:00'),
  ('wh_u13_s1', 'fake_u13', 'seed_1', '2026-05-27 11:30:00', 888, '2026-05-27 11:45:00'),
  ('wh_u15_s1', 'fake_u15', 'seed_1', '2026-05-28 13:00:00', 888, '2026-05-28 13:15:00'),
  ('wh_u17_s1', 'fake_u17', 'seed_1', '2026-05-30 17:00:00', 888, '2026-05-30 17:15:00'),
  ('wh_u19_s1', 'fake_u19', 'seed_1', '2026-06-01 12:00:00', 700, NULL),
  ('wh_u21_s1', 'fake_u21', 'seed_1', '2026-06-03 17:00:00', 888, '2026-06-03 17:15:00'),
-- seed_2 (Tears of Steel)
  ('wh_u02_s2', 'fake_u02', 'seed_2', '2026-05-22 15:00:00', 734, '2026-05-22 15:12:00'),
  ('wh_u04_s2', 'fake_u04', 'seed_2', '2026-05-23 18:00:00', 734, '2026-05-23 18:12:00'),
  ('wh_u06_s2', 'fake_u06', 'seed_2', '2026-05-24 22:00:00', 400, NULL),
  ('wh_u08_s2', 'fake_u08', 'seed_2', '2026-05-25 17:00:00', 734, '2026-05-25 17:12:00'),
  ('wh_u10_s2', 'fake_u10', 'seed_2', '2026-05-26 20:00:00', 734, '2026-05-26 20:12:00'),
  ('wh_u12_s2', 'fake_u12', 'seed_2', '2026-05-27 14:00:00', 734, '2026-05-27 14:12:00'),
  ('wh_u14_s2', 'fake_u14', 'seed_2', '2026-05-28 22:00:00', 734, '2026-05-28 22:12:00'),
  ('wh_u16_s2', 'fake_u16', 'seed_2', '2026-05-30 09:00:00', 734, '2026-05-30 09:12:00'),
  ('wh_u20_s2', 'fake_u20', 'seed_2', '2026-06-02 15:00:00', 734, '2026-06-02 15:12:00'),
-- seed_3 (Elephants Dream)
  ('wh_u01_s3', 'fake_u01', 'seed_3', '2026-05-22 10:00:00', 654, '2026-05-22 10:11:00'),
  ('wh_u05_s3', 'fake_u05', 'seed_3', '2026-05-24 14:00:00', 654, '2026-05-24 14:11:00'),
  ('wh_u09_s3', 'fake_u09', 'seed_3', '2026-05-26 10:00:00', 500, NULL),
  ('wh_u13_s3', 'fake_u13', 'seed_3', '2026-05-28 11:00:00', 654, '2026-05-28 11:11:00'),
  ('wh_u17_s3', 'fake_u17', 'seed_3', '2026-05-31 10:00:00', 654, '2026-05-31 10:11:00'),
  ('wh_u21_s3', 'fake_u21', 'seed_3', '2026-06-03 18:00:00', 654, '2026-06-03 18:11:00'),
  ('wh_u22_s3', 'fake_u22', 'seed_3', '2026-06-04 11:00:00', 654, '2026-06-04 11:11:00'),
  ('wh_u23_s3', 'fake_u23', 'seed_3', '2026-06-04 19:30:00', 654, '2026-06-04 19:41:00'),
  ('wh_u24_s3', 'fake_u24', 'seed_3', '2026-06-05 09:00:00', 320, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Ad Campaigns (3 more) ───────────────────────────────────────
INSERT INTO "AdCampaign" (id, name, advertiser, "budgetCents", "startDate", "endDate", status, "createdAt", "updatedAt")
VALUES
  ('fake_camp01', 'Summer Sale 2026',       'TechGadgets Inc.',    2500000, '2026-05-20 00:00:00', '2026-06-30 00:00:00', 'ACTIVE', '2026-05-18 10:00:00', '2026-05-18 10:00:00'),
  ('fake_camp02', 'Movie Premiere Launch',  'StreamFlix Studios',  1800000, '2026-05-25 00:00:00', '2026-06-15 00:00:00', 'ACTIVE', '2026-05-22 14:00:00', '2026-05-22 14:00:00'),
  ('fake_camp03', 'Sports Gear Promo',      'ProSport Co.',        900000,  '2026-06-01 00:00:00', '2026-06-30 00:00:00', 'ACTIVE', '2026-05-30 09:00:00', '2026-05-30 09:00:00'),
  ('fake_camp04', 'Back-to-School Drive',   'EduLearn Platform',   500000,  '2026-05-15 00:00:00', '2026-05-31 00:00:00', 'DONE',   '2026-05-12 11:00:00', '2026-06-01 00:00:00')
ON CONFLICT (id) DO NOTHING;

-- ── 5. Ad Creatives (4 more) ──────────────────────────────────────
INSERT INTO "AdCreative" (id, title, "advertiserName", "clickUrl", "skipOffsetSec", "durationSec", status, "inputKey", "hlsBasePath", "createdAt", "updatedAt")
VALUES
  ('fake_cr01', 'TechGadgets Summer 30s',   'TechGadgets Inc.',    'https://techgadgets.example.com/sale',    5,    30, 'READY', 'ads/fake_cr01/input.mp4', 'ads/fake_cr01/hls', '2026-05-18 10:30:00', '2026-05-18 11:00:00'),
  ('fake_cr02', 'StreamFlix Premiere 15s',  'StreamFlix Studios',  'https://streamflix.example.com/premiere', NULL, 15, 'READY', 'ads/fake_cr02/input.mp4', 'ads/fake_cr02/hls', '2026-05-22 14:30:00', '2026-05-22 15:00:00'),
  ('fake_cr03', 'ProSport Running Shoes',   'ProSport Co.',        'https://prosport.example.com/shoes',      5,    20, 'READY', 'ads/fake_cr03/input.mp4', 'ads/fake_cr03/hls', '2026-05-30 09:30:00', '2026-05-30 10:00:00'),
  ('fake_cr04', 'EduLearn Back-to-School',  'EduLearn Platform',   'https://edulearn.example.com/enroll',     NULL, 12, 'READY', 'ads/fake_cr04/input.mp4', 'ads/fake_cr04/hls', '2026-05-12 11:30:00', '2026-05-12 12:00:00')
ON CONFLICT (id) DO NOTHING;

-- ── 6. Ad Placements ──────────────────────────────────────────────
INSERT INTO "AdPlacement" (id, "campaignId", "creativeId", "breakType", "midRollOffsetSec", "targetCategory", "targetVideoId", "maxAdsPerPod", "frequencyCapPerDay", "cpmCents", "createdAt")
VALUES
  ('fake_pl01', 'fake_camp01', 'fake_cr01', 'PRE',  NULL, NULL,            NULL,     1, 3, 850,  '2026-05-18 10:00:00'),
  ('fake_pl02', 'fake_camp01', 'fake_cr01', 'MID',  120,  'Entertainment', NULL,     1, 2, 1050, '2026-05-18 10:00:00'),
  ('fake_pl03', 'fake_camp02', 'fake_cr02', 'PRE',  NULL, 'Entertainment', NULL,     1, 5, 1200, '2026-05-22 14:00:00'),
  ('fake_pl04', 'fake_camp02', 'fake_cr02', 'POST', NULL, NULL,            NULL,     1, 3, 600,  '2026-05-22 14:00:00'),
  ('fake_pl05', 'fake_camp03', 'fake_cr03', 'PRE',  NULL, 'Sports',        NULL,     1, 3, 950,  '2026-05-30 09:00:00'),
  ('fake_pl06', 'fake_camp03', 'fake_cr03', 'MID',  90,   'Sports',        NULL,     1, 2, 1100, '2026-05-30 09:00:00'),
  ('fake_pl07', 'fake_camp04', 'fake_cr04', 'PRE',  NULL, 'Tutorial',      NULL,     1, 4, 700,  '2026-05-12 11:00:00'),
  ('fake_pl08', 'fake_camp04', 'fake_cr04', 'PRE',  NULL, NULL,            'seed_3', 1, 2, 750,  '2026-05-12 11:00:00')
ON CONFLICT (id) DO NOTHING;

-- ── 7. Ad Impressions – spread over 16 days ───────────────────────
-- We insert impression rows for each event type to simulate a realistic funnel:
-- IMPRESSION → Q1 (~80%) → Q2 (~65%) → Q3 (~52%) → COMPLETE (~40%) → SKIP (~18%) → CLICK (~8%)

INSERT INTO "AdImpression" (id, "creativeId", "placementId", "videoId", "userId", "sessionId", event, "recordedAt")
VALUES
-- Day 1 (2026-05-20) – campaign went live
  ('ai001','fake_cr01','fake_pl01','seed_0','fake_u01','sess_001','IMPRESSION','2026-05-20 10:05:00'),
  ('ai002','fake_cr01','fake_pl01','seed_0','fake_u01','sess_001','Q1',        '2026-05-20 10:05:08'),
  ('ai003','fake_cr01','fake_pl01','seed_0','fake_u01','sess_001','Q2',        '2026-05-20 10:05:15'),
  ('ai004','fake_cr01','fake_pl01','seed_0','fake_u01','sess_001','Q3',        '2026-05-20 10:05:22'),
  ('ai005','fake_cr01','fake_pl01','seed_0','fake_u01','sess_001','COMPLETE',  '2026-05-20 10:05:30'),
  ('ai006','fake_cr01','fake_pl01','seed_1',NULL,       'sess_002','IMPRESSION','2026-05-20 11:00:00'),
  ('ai007','fake_cr01','fake_pl01','seed_1',NULL,       'sess_002','Q1',        '2026-05-20 11:00:08'),
  ('ai008','fake_cr01','fake_pl01','seed_1',NULL,       'sess_002','SKIP',      '2026-05-20 11:00:05'),
  ('ai009','fake_cr02','fake_pl03','seed_0','fake_u02','sess_003','IMPRESSION','2026-05-20 14:30:00'),
  ('ai010','fake_cr02','fake_pl03','seed_0','fake_u02','sess_003','Q1',        '2026-05-20 14:30:04'),
  ('ai011','fake_cr02','fake_pl03','seed_0','fake_u02','sess_003','COMPLETE',  '2026-05-20 14:30:15'),
-- Day 2
  ('ai012','fake_cr01','fake_pl01','seed_0','fake_u03','sess_004','IMPRESSION','2026-05-21 09:31:00'),
  ('ai013','fake_cr01','fake_pl01','seed_0','fake_u03','sess_004','Q1',        '2026-05-21 09:31:08'),
  ('ai014','fake_cr01','fake_pl01','seed_0','fake_u03','sess_004','Q2',        '2026-05-21 09:31:15'),
  ('ai015','fake_cr01','fake_pl01','seed_0','fake_u03','sess_004','Q3',        '2026-05-21 09:31:22'),
  ('ai016','fake_cr01','fake_pl01','seed_0','fake_u03','sess_004','COMPLETE',  '2026-05-21 09:31:30'),
  ('ai017','fake_cr01','fake_pl02','seed_1','fake_u04','sess_005','IMPRESSION','2026-05-21 14:52:00'),
  ('ai018','fake_cr01','fake_pl02','seed_1','fake_u04','sess_005','Q1',        '2026-05-21 14:52:08'),
  ('ai019','fake_cr01','fake_pl02','seed_1','fake_u04','sess_005','SKIP',      '2026-05-21 14:52:05'),
  ('ai020','fake_cr04','fake_pl07','seed_3','fake_u05','sess_006','IMPRESSION','2026-05-21 10:15:00'),
  ('ai021','fake_cr04','fake_pl07','seed_3','fake_u05','sess_006','Q1',        '2026-05-21 10:15:03'),
  ('ai022','fake_cr04','fake_pl07','seed_3','fake_u05','sess_006','Q2',        '2026-05-21 10:15:06'),
  ('ai023','fake_cr04','fake_pl07','seed_3','fake_u05','sess_006','Q3',        '2026-05-21 10:15:09'),
  ('ai024','fake_cr04','fake_pl07','seed_3','fake_u05','sess_006','COMPLETE',  '2026-05-21 10:15:12'),
-- Day 3
  ('ai025','fake_cr01','fake_pl01','seed_0','fake_u06','sess_007','IMPRESSION','2026-05-22 08:21:00'),
  ('ai026','fake_cr01','fake_pl01','seed_0','fake_u06','sess_007','Q1',        '2026-05-22 08:21:08'),
  ('ai027','fake_cr01','fake_pl01','seed_0','fake_u06','sess_007','Q2',        '2026-05-22 08:21:15'),
  ('ai028','fake_cr01','fake_pl01','seed_0','fake_u06','sess_007','CLICK',     '2026-05-22 08:21:20'),
  ('ai029','fake_cr02','fake_pl03','seed_1','fake_u07','sess_008','IMPRESSION','2026-05-22 08:22:00'),
  ('ai030','fake_cr02','fake_pl03','seed_1','fake_u07','sess_008','Q1',        '2026-05-22 08:22:04'),
  ('ai031','fake_cr02','fake_pl03','seed_1','fake_u07','sess_008','COMPLETE',  '2026-05-22 08:22:15'),
  ('ai032','fake_cr02','fake_pl03','seed_2','fake_u08','sess_009','IMPRESSION','2026-05-22 15:02:00'),
  ('ai033','fake_cr02','fake_pl03','seed_2','fake_u08','sess_009','Q1',        '2026-05-22 15:02:04'),
  ('ai034','fake_cr02','fake_pl03','seed_2','fake_u08','sess_009','SKIP',      '2026-05-22 15:02:04'),
-- Day 4
  ('ai035','fake_cr01','fake_pl01','seed_0','fake_u09','sess_010','IMPRESSION','2026-05-23 10:16:00'),
  ('ai036','fake_cr01','fake_pl01','seed_0','fake_u09','sess_010','Q1',        '2026-05-23 10:16:08'),
  ('ai037','fake_cr01','fake_pl01','seed_0','fake_u09','sess_010','Q2',        '2026-05-23 10:16:15'),
  ('ai038','fake_cr01','fake_pl01','seed_0','fake_u09','sess_010','Q3',        '2026-05-23 10:16:22'),
  ('ai039','fake_cr01','fake_pl01','seed_0','fake_u09','sess_010','COMPLETE',  '2026-05-23 10:16:30'),
  ('ai040','fake_cr03','fake_pl05','seed_4','fake_u10','sess_011','IMPRESSION','2026-05-23 19:01:00'),
  ('ai041','fake_cr03','fake_pl05','seed_4','fake_u10','sess_011','Q1',        '2026-05-23 19:01:05'),
  ('ai042','fake_cr03','fake_pl05','seed_4','fake_u10','sess_011','Q2',        '2026-05-23 19:01:10'),
  ('ai043','fake_cr03','fake_pl05','seed_4','fake_u10','sess_011','COMPLETE',  '2026-05-23 19:01:20'),
  ('ai044','fake_cr04','fake_pl07','seed_3','fake_u11','sess_012','IMPRESSION','2026-05-23 22:05:00'),
  ('ai045','fake_cr04','fake_pl07','seed_3','fake_u11','sess_012','Q1',        '2026-05-23 22:05:03'),
  ('ai046','fake_cr04','fake_pl07','seed_3','fake_u11','sess_012','Q2',        '2026-05-23 22:05:06'),
  ('ai047','fake_cr04','fake_pl07','seed_3','fake_u11','sess_012','SKIP',      '2026-05-23 22:05:09'),
-- Day 5
  ('ai048','fake_cr01','fake_pl01','seed_0','fake_u12','sess_013','IMPRESSION','2026-05-24 11:46:00'),
  ('ai049','fake_cr01','fake_pl01','seed_0','fake_u12','sess_013','Q1',        '2026-05-24 11:46:08'),
  ('ai050','fake_cr01','fake_pl01','seed_0','fake_u12','sess_013','Q2',        '2026-05-24 11:46:15'),
  ('ai051','fake_cr01','fake_pl01','seed_0','fake_u12','sess_013','Q3',        '2026-05-24 11:46:22'),
  ('ai052','fake_cr01','fake_pl01','seed_0','fake_u12','sess_013','COMPLETE',  '2026-05-24 11:46:30'),
  ('ai053','fake_cr01','fake_pl01','seed_0','fake_u12','sess_013','CLICK',     '2026-05-24 11:46:32'),
  ('ai054','fake_cr02','fake_pl03','seed_0','fake_u13','sess_014','IMPRESSION','2026-05-24 13:01:00'),
  ('ai055','fake_cr02','fake_pl03','seed_0','fake_u13','sess_014','Q1',        '2026-05-24 13:01:04'),
  ('ai056','fake_cr02','fake_pl03','seed_0','fake_u13','sess_014','COMPLETE',  '2026-05-24 13:01:15'),
-- Day 6
  ('ai057','fake_cr01','fake_pl01','seed_0','fake_u14','sess_015','IMPRESSION','2026-05-25 09:41:00'),
  ('ai058','fake_cr01','fake_pl01','seed_0','fake_u14','sess_015','Q1',        '2026-05-25 09:41:08'),
  ('ai059','fake_cr01','fake_pl01','seed_0','fake_u14','sess_015','Q2',        '2026-05-25 09:41:15'),
  ('ai060','fake_cr01','fake_pl01','seed_0','fake_u14','sess_015','Q3',        '2026-05-25 09:41:22'),
  ('ai061','fake_cr01','fake_pl01','seed_0','fake_u14','sess_015','COMPLETE',  '2026-05-25 09:41:30'),
  ('ai062','fake_cr03','fake_pl05','seed_4','fake_u15','sess_016','IMPRESSION','2026-05-25 12:21:00'),
  ('ai063','fake_cr03','fake_pl05','seed_4','fake_u15','sess_016','Q1',        '2026-05-25 12:21:05'),
  ('ai064','fake_cr03','fake_pl05','seed_4','fake_u15','sess_016','SKIP',      '2026-05-25 12:21:05'),
  ('ai065','fake_cr04','fake_pl08','seed_3','fake_u16','sess_017','IMPRESSION','2026-05-25 19:01:00'),
  ('ai066','fake_cr04','fake_pl08','seed_3','fake_u16','sess_017','Q1',        '2026-05-25 19:01:03'),
  ('ai067','fake_cr04','fake_pl08','seed_3','fake_u16','sess_017','Q2',        '2026-05-25 19:01:06'),
  ('ai068','fake_cr04','fake_pl08','seed_3','fake_u16','sess_017','Q3',        '2026-05-25 19:01:09'),
  ('ai069','fake_cr04','fake_pl08','seed_3','fake_u16','sess_017','COMPLETE',  '2026-05-25 19:01:12'),
-- Day 7
  ('ai070','fake_cr01','fake_pl01','seed_0','fake_u17','sess_018','IMPRESSION','2026-05-26 08:01:00'),
  ('ai071','fake_cr01','fake_pl01','seed_0','fake_u17','sess_018','Q1',        '2026-05-26 08:01:08'),
  ('ai072','fake_cr01','fake_pl01','seed_0','fake_u17','sess_018','Q2',        '2026-05-26 08:01:15'),
  ('ai073','fake_cr01','fake_pl01','seed_0','fake_u17','sess_018','Q3',        '2026-05-26 08:01:22'),
  ('ai074','fake_cr01','fake_pl01','seed_0','fake_u17','sess_018','COMPLETE',  '2026-05-26 08:01:30'),
  ('ai075','fake_cr02','fake_pl04','seed_1','fake_u18','sess_019','IMPRESSION','2026-05-26 09:16:00'),
  ('ai076','fake_cr02','fake_pl04','seed_1','fake_u18','sess_019','Q1',        '2026-05-26 09:16:04'),
  ('ai077','fake_cr02','fake_pl04','seed_1','fake_u18','sess_019','Q2',        '2026-05-26 09:16:08'),
  ('ai078','fake_cr02','fake_pl04','seed_1','fake_u18','sess_019','COMPLETE',  '2026-05-26 09:16:15'),
  ('ai079','fake_cr02','fake_pl04','seed_1','fake_u18','sess_019','CLICK',     '2026-05-26 09:16:16'),
  ('ai080','fake_cr03','fake_pl06','seed_4','fake_u19','sess_020','IMPRESSION','2026-05-26 13:31:00'),
  ('ai081','fake_cr03','fake_pl06','seed_4','fake_u19','sess_020','Q1',        '2026-05-26 13:31:05'),
  ('ai082','fake_cr03','fake_pl06','seed_4','fake_u19','sess_020','Q2',        '2026-05-26 13:31:10'),
  ('ai083','fake_cr03','fake_pl06','seed_4','fake_u19','sess_020','Q3',        '2026-05-26 13:31:15'),
  ('ai084','fake_cr03','fake_pl06','seed_4','fake_u19','sess_020','COMPLETE',  '2026-05-26 13:31:20'),
-- Day 8
  ('ai085','fake_cr01','fake_pl01','seed_0','fake_u20','sess_021','IMPRESSION','2026-05-27 10:46:00'),
  ('ai086','fake_cr01','fake_pl01','seed_0','fake_u20','sess_021','Q1',        '2026-05-27 10:46:08'),
  ('ai087','fake_cr01','fake_pl01','seed_0','fake_u20','sess_021','Q2',        '2026-05-27 10:46:15'),
  ('ai088','fake_cr01','fake_pl01','seed_0','fake_u20','sess_021','SKIP',      '2026-05-27 10:46:05'),
  ('ai089','fake_cr02','fake_pl03','seed_2','fake_u21','sess_022','IMPRESSION','2026-05-27 11:31:00'),
  ('ai090','fake_cr02','fake_pl03','seed_2','fake_u21','sess_022','Q1',        '2026-05-27 11:31:04'),
  ('ai091','fake_cr02','fake_pl03','seed_2','fake_u21','sess_022','Q2',        '2026-05-27 11:31:08'),
  ('ai092','fake_cr02','fake_pl03','seed_2','fake_u21','sess_022','Q3',        '2026-05-27 11:31:12'),
  ('ai093','fake_cr02','fake_pl03','seed_2','fake_u21','sess_022','COMPLETE',  '2026-05-27 11:31:15'),
  ('ai094','fake_cr04','fake_pl07','seed_3','fake_u22','sess_023','IMPRESSION','2026-05-27 21:21:00'),
  ('ai095','fake_cr04','fake_pl07','seed_3','fake_u22','sess_023','Q1',        '2026-05-27 21:21:03'),
  ('ai096','fake_cr04','fake_pl07','seed_3','fake_u22','sess_023','Q2',        '2026-05-27 21:21:06'),
  ('ai097','fake_cr04','fake_pl07','seed_3','fake_u22','sess_023','COMPLETE',  '2026-05-27 21:21:12'),
-- Day 9
  ('ai098','fake_cr01','fake_pl01','seed_0','fake_u23','sess_024','IMPRESSION','2026-05-28 12:16:00'),
  ('ai099','fake_cr01','fake_pl01','seed_0','fake_u23','sess_024','Q1',        '2026-05-28 12:16:08'),
  ('ai100','fake_cr01','fake_pl01','seed_0','fake_u23','sess_024','Q2',        '2026-05-28 12:16:15'),
  ('ai101','fake_cr01','fake_pl01','seed_0','fake_u23','sess_024','Q3',        '2026-05-28 12:16:22'),
  ('ai102','fake_cr01','fake_pl01','seed_0','fake_u23','sess_024','COMPLETE',  '2026-05-28 12:16:30'),
  ('ai103','fake_cr03','fake_pl05','seed_4','fake_u24','sess_025','IMPRESSION','2026-05-28 22:01:00'),
  ('ai104','fake_cr03','fake_pl05','seed_4','fake_u24','sess_025','Q1',        '2026-05-28 22:01:05'),
  ('ai105','fake_cr03','fake_pl05','seed_4','fake_u24','sess_025','Q2',        '2026-05-28 22:01:10'),
  ('ai106','fake_cr03','fake_pl05','seed_4','fake_u24','sess_025','Q3',        '2026-05-28 22:01:15'),
  ('ai107','fake_cr03','fake_pl05','seed_4','fake_u24','sess_025','COMPLETE',  '2026-05-28 22:01:20'),
  ('ai108','fake_cr03','fake_pl05','seed_4','fake_u24','sess_025','CLICK',     '2026-05-28 22:01:22'),
-- Day 10-16 (higher volume as platform grows)
  ('ai109','fake_cr01','fake_pl01','seed_0','fake_u01','sess_026','IMPRESSION','2026-05-29 08:36:00'),
  ('ai110','fake_cr01','fake_pl01','seed_0','fake_u01','sess_026','Q1',        '2026-05-29 08:36:08'),
  ('ai111','fake_cr01','fake_pl01','seed_0','fake_u01','sess_026','Q2',        '2026-05-29 08:36:15'),
  ('ai112','fake_cr01','fake_pl01','seed_0','fake_u01','sess_026','Q3',        '2026-05-29 08:36:22'),
  ('ai113','fake_cr01','fake_pl01','seed_0','fake_u01','sess_026','COMPLETE',  '2026-05-29 08:36:30'),
  ('ai114','fake_cr01','fake_pl02','seed_1','fake_u03','sess_027','IMPRESSION','2026-05-29 09:03:00'),
  ('ai115','fake_cr01','fake_pl02','seed_1','fake_u03','sess_027','Q1',        '2026-05-29 09:03:08'),
  ('ai116','fake_cr01','fake_pl02','seed_1','fake_u03','sess_027','SKIP',      '2026-05-29 09:03:05'),
  ('ai117','fake_cr02','fake_pl03','seed_0','fake_u05','sess_028','IMPRESSION','2026-05-29 11:01:00'),
  ('ai118','fake_cr02','fake_pl03','seed_0','fake_u05','sess_028','Q1',        '2026-05-29 11:01:04'),
  ('ai119','fake_cr02','fake_pl03','seed_0','fake_u05','sess_028','COMPLETE',  '2026-05-29 11:01:15'),
  ('ai120','fake_cr03','fake_pl05','seed_4','fake_u07','sess_029','IMPRESSION','2026-05-30 16:01:00'),
  ('ai121','fake_cr03','fake_pl05','seed_4','fake_u07','sess_029','Q1',        '2026-05-30 16:01:05'),
  ('ai122','fake_cr03','fake_pl05','seed_4','fake_u07','sess_029','Q2',        '2026-05-30 16:01:10'),
  ('ai123','fake_cr03','fake_pl05','seed_4','fake_u07','sess_029','Q3',        '2026-05-30 16:01:15'),
  ('ai124','fake_cr03','fake_pl05','seed_4','fake_u07','sess_029','COMPLETE',  '2026-05-30 16:01:20'),
  ('ai125','fake_cr01','fake_pl01','seed_0','fake_u09','sess_030','IMPRESSION','2026-05-30 17:01:00'),
  ('ai126','fake_cr01','fake_pl01','seed_0','fake_u09','sess_030','Q1',        '2026-05-30 17:01:08'),
  ('ai127','fake_cr01','fake_pl01','seed_0','fake_u09','sess_030','Q2',        '2026-05-30 17:01:15'),
  ('ai128','fake_cr01','fake_pl01','seed_0','fake_u09','sess_030','Q3',        '2026-05-30 17:01:22'),
  ('ai129','fake_cr01','fake_pl01','seed_0','fake_u09','sess_030','COMPLETE',  '2026-05-30 17:01:30'),
  ('ai130','fake_cr02','fake_pl03','seed_2','fake_u11','sess_031','IMPRESSION','2026-05-31 09:16:00'),
  ('ai131','fake_cr02','fake_pl03','seed_2','fake_u11','sess_031','Q1',        '2026-05-31 09:16:04'),
  ('ai132','fake_cr02','fake_pl03','seed_2','fake_u11','sess_031','Q2',        '2026-05-31 09:16:08'),
  ('ai133','fake_cr02','fake_pl03','seed_2','fake_u11','sess_031','COMPLETE',  '2026-05-31 09:16:15'),
  ('ai134','fake_cr02','fake_pl03','seed_2','fake_u11','sess_031','CLICK',     '2026-05-31 09:16:16'),
  ('ai135','fake_cr01','fake_pl01','seed_0','fake_u13','sess_032','IMPRESSION','2026-05-31 10:31:00'),
  ('ai136','fake_cr01','fake_pl01','seed_0','fake_u13','sess_032','Q1',        '2026-05-31 10:31:08'),
  ('ai137','fake_cr01','fake_pl01','seed_0','fake_u13','sess_032','Q2',        '2026-05-31 10:31:15'),
  ('ai138','fake_cr01','fake_pl01','seed_0','fake_u13','sess_032','SKIP',      '2026-05-31 10:31:05'),
  ('ai139','fake_cr03','fake_pl06','seed_4','fake_u15','sess_033','IMPRESSION','2026-06-01 12:01:00'),
  ('ai140','fake_cr03','fake_pl06','seed_4','fake_u15','sess_033','Q1',        '2026-06-01 12:01:05'),
  ('ai141','fake_cr03','fake_pl06','seed_4','fake_u15','sess_033','Q2',        '2026-06-01 12:01:10'),
  ('ai142','fake_cr03','fake_pl06','seed_4','fake_u15','sess_033','Q3',        '2026-06-01 12:01:15'),
  ('ai143','fake_cr03','fake_pl06','seed_4','fake_u15','sess_033','COMPLETE',  '2026-06-01 12:01:20'),
  ('ai144','fake_cr01','fake_pl01','seed_3','fake_u17','sess_034','IMPRESSION','2026-06-01 12:01:00'),
  ('ai145','fake_cr01','fake_pl01','seed_3','fake_u17','sess_034','Q1',        '2026-06-01 12:01:08'),
  ('ai146','fake_cr01','fake_pl01','seed_3','fake_u17','sess_034','Q2',        '2026-06-01 12:01:15'),
  ('ai147','fake_cr01','fake_pl01','seed_3','fake_u17','sess_034','Q3',        '2026-06-01 12:01:22'),
  ('ai148','fake_cr01','fake_pl01','seed_3','fake_u17','sess_034','COMPLETE',  '2026-06-01 12:01:30'),
  ('ai149','fake_cr02','fake_pl04','seed_1','fake_u19','sess_035','IMPRESSION','2026-06-02 14:16:00'),
  ('ai150','fake_cr02','fake_pl04','seed_1','fake_u19','sess_035','Q1',        '2026-06-02 14:16:04'),
  ('ai151','fake_cr02','fake_pl04','seed_1','fake_u19','sess_035','COMPLETE',  '2026-06-02 14:16:15'),
  ('ai152','fake_cr02','fake_pl04','seed_1','fake_u19','sess_035','CLICK',     '2026-06-02 14:16:16'),
  ('ai153','fake_cr01','fake_pl01','seed_0','fake_u21','sess_036','IMPRESSION','2026-06-02 15:01:00'),
  ('ai154','fake_cr01','fake_pl01','seed_0','fake_u21','sess_036','Q1',        '2026-06-02 15:01:08'),
  ('ai155','fake_cr01','fake_pl01','seed_0','fake_u21','sess_036','Q2',        '2026-06-02 15:01:15'),
  ('ai156','fake_cr01','fake_pl01','seed_0','fake_u21','sess_036','Q3',        '2026-06-02 15:01:22'),
  ('ai157','fake_cr01','fake_pl01','seed_0','fake_u21','sess_036','COMPLETE',  '2026-06-02 15:01:30'),
  ('ai158','fake_cr03','fake_pl05','seed_4','fake_u23','sess_037','IMPRESSION','2026-06-03 17:01:00'),
  ('ai159','fake_cr03','fake_pl05','seed_4','fake_u23','sess_037','Q1',        '2026-06-03 17:01:05'),
  ('ai160','fake_cr03','fake_pl05','seed_4','fake_u23','sess_037','Q2',        '2026-06-03 17:01:10'),
  ('ai161','fake_cr03','fake_pl05','seed_4','fake_u23','sess_037','SKIP',      '2026-06-03 17:01:05'),
  ('ai162','fake_cr01','fake_pl01','seed_3','fake_u22','sess_038','IMPRESSION','2026-06-03 18:01:00'),
  ('ai163','fake_cr01','fake_pl01','seed_3','fake_u22','sess_038','Q1',        '2026-06-03 18:01:08'),
  ('ai164','fake_cr01','fake_pl01','seed_3','fake_u22','sess_038','Q2',        '2026-06-03 18:01:15'),
  ('ai165','fake_cr01','fake_pl01','seed_3','fake_u22','sess_038','Q3',        '2026-06-03 18:01:22'),
  ('ai166','fake_cr01','fake_pl01','seed_3','fake_u22','sess_038','COMPLETE',  '2026-06-03 18:01:30'),
  ('ai167','fake_cr02','fake_pl03','seed_0','fake_u24','sess_039','IMPRESSION','2026-06-04 10:11:00'),
  ('ai168','fake_cr02','fake_pl03','seed_0','fake_u24','sess_039','Q1',        '2026-06-04 10:11:04'),
  ('ai169','fake_cr02','fake_pl03','seed_0','fake_u24','sess_039','COMPLETE',  '2026-06-04 10:11:15'),
  ('ai170','fake_cr01','fake_pl02','seed_1','fake_u02','sess_040','IMPRESSION','2026-06-04 11:01:00'),
  ('ai171','fake_cr01','fake_pl02','seed_1','fake_u02','sess_040','Q1',        '2026-06-04 11:01:08'),
  ('ai172','fake_cr01','fake_pl02','seed_1','fake_u02','sess_040','Q2',        '2026-06-04 11:01:15'),
  ('ai173','fake_cr01','fake_pl02','seed_1','fake_u02','sess_040','Q3',        '2026-06-04 11:01:22'),
  ('ai174','fake_cr01','fake_pl02','seed_1','fake_u02','sess_040','COMPLETE',  '2026-06-04 11:01:30'),
  ('ai175','fake_cr03','fake_pl05','seed_4','fake_u04','sess_041','IMPRESSION','2026-06-04 19:01:00'),
  ('ai176','fake_cr03','fake_pl05','seed_4','fake_u04','sess_041','Q1',        '2026-06-04 19:01:05'),
  ('ai177','fake_cr03','fake_pl05','seed_4','fake_u04','sess_041','Q2',        '2026-06-04 19:01:10'),
  ('ai178','fake_cr03','fake_pl05','seed_4','fake_u04','sess_041','Q3',        '2026-06-04 19:01:15'),
  ('ai179','fake_cr03','fake_pl05','seed_4','fake_u04','sess_041','COMPLETE',  '2026-06-04 19:01:20'),
  ('ai180','fake_cr03','fake_pl05','seed_4','fake_u04','sess_041','CLICK',     '2026-06-04 19:01:22'),
-- Day 16 (today, 2026-06-05) – still growing
  ('ai181','fake_cr01','fake_pl01','seed_0','fake_u06','sess_042','IMPRESSION','2026-06-05 08:31:00'),
  ('ai182','fake_cr01','fake_pl01','seed_0','fake_u06','sess_042','Q1',        '2026-06-05 08:31:08'),
  ('ai183','fake_cr01','fake_pl01','seed_0','fake_u06','sess_042','Q2',        '2026-06-05 08:31:15'),
  ('ai184','fake_cr01','fake_pl01','seed_0','fake_u06','sess_042','Q3',        '2026-06-05 08:31:22'),
  ('ai185','fake_cr01','fake_pl01','seed_0','fake_u06','sess_042','COMPLETE',  '2026-06-05 08:31:30'),
  ('ai186','fake_cr02','fake_pl03','seed_2','fake_u08','sess_043','IMPRESSION','2026-06-05 09:01:00'),
  ('ai187','fake_cr02','fake_pl03','seed_2','fake_u08','sess_043','Q1',        '2026-06-05 09:01:04'),
  ('ai188','fake_cr02','fake_pl03','seed_2','fake_u08','sess_043','Q2',        '2026-06-05 09:01:08'),
  ('ai189','fake_cr02','fake_pl03','seed_2','fake_u08','sess_043','COMPLETE',  '2026-06-05 09:01:15'),
  ('ai190','fake_cr03','fake_pl06','seed_4','fake_u10','sess_044','IMPRESSION','2026-06-05 09:30:00'),
  ('ai191','fake_cr03','fake_pl06','seed_4','fake_u10','sess_044','Q1',        '2026-06-05 09:30:05'),
  ('ai192','fake_cr03','fake_pl06','seed_4','fake_u10','sess_044','Q2',        '2026-06-05 09:30:10'),
  ('ai193','fake_cr03','fake_pl06','seed_4','fake_u10','sess_044','Q3',        '2026-06-05 09:30:15'),
  ('ai194','fake_cr03','fake_pl06','seed_4','fake_u10','sess_044','COMPLETE',  '2026-06-05 09:30:20')
ON CONFLICT (id) DO NOTHING;

-- ── 8. Audit log entries ──────────────────────────────────────────
INSERT INTO "AuditLog" (id, "userId", action, "entityType", "entityId", metadata, ip, "userAgent", "createdAt")
VALUES
  ('al01', 'cmpee6gus0002uion8ewkf7tk', 'admin.video.list',     'Video',       NULL,     '{"count":13}',           '127.0.0.1', 'Mozilla/5.0', '2026-05-20 18:35:00'),
  ('al02', 'cmpee6grh0000uionvu3dgw0f', 'video.upload',         'Video',       'seed_0', '{"title":"Big Buck Bunny"}','127.0.0.1','Mozilla/5.0', '2026-05-20 18:30:00'),
  ('al03', 'cmpee6gtd0001uionqcqs88xh', 'video.upload',         'Video',       'seed_1', '{"title":"Sintel"}',      '127.0.0.1', 'Mozilla/5.0', '2026-05-20 18:30:13'),
  ('al04', 'cmpee6gus0002uion8ewkf7tk', 'admin.campaign.create','AdCampaign',  'fake_camp01','{"advertiser":"TechGadgets Inc."}','127.0.0.1','Mozilla/5.0','2026-05-18 10:00:00'),
  ('al05', 'cmpee6gus0002uion8ewkf7tk', 'admin.campaign.create','AdCampaign',  'fake_camp02','{"advertiser":"StreamFlix Studios"}','127.0.0.1','Mozilla/5.0','2026-05-22 14:00:00'),
  ('al06', 'cmpee6gus0002uion8ewkf7tk', 'admin.campaign.create','AdCampaign',  'fake_camp03','{"advertiser":"ProSport Co."}','127.0.0.1','Mozilla/5.0','2026-05-30 09:00:00'),
  ('al07', 'cmpee6gus0002uion8ewkf7tk', 'admin.campaign.update','AdCampaign',  'fake_camp04','{"status":"DONE"}',     '127.0.0.1', 'Mozilla/5.0', '2026-06-01 00:05:00'),
  ('al08', 'fake_u01',                  'user.login',           'User',        'fake_u01',NULL,                     '10.0.0.1',  'Mozilla/5.0 iPhone', '2026-05-21 09:08:00'),
  ('al09', 'fake_u05',                  'user.register',        'User',        'fake_u05',NULL,                     '10.0.0.5',  'Mozilla/5.0', '2026-05-23 10:00:00'),
  ('al10', 'cmpee6gus0002uion8ewkf7tk', 'admin.user.list',      'User',        NULL,     '{"count":8}',             '127.0.0.1', 'Mozilla/5.0', '2026-05-24 09:00:00')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ── Verification summary ──────────────────────────────────────────
SELECT
  (SELECT count(*) FROM "User")         AS total_users,
  (SELECT count(*) FROM "Video")        AS total_videos,
  (SELECT count(*) FROM "WatchHistory") AS watch_history_rows,
  (SELECT count(*) FROM "AdCampaign")   AS campaigns,
  (SELECT count(*) FROM "AdCreative")   AS creatives,
  (SELECT count(*) FROM "AdPlacement")  AS placements,
  (SELECT count(*) FROM "AdImpression") AS impressions,
  (SELECT count(*) FROM "AuditLog")     AS audit_logs;

SELECT event, count(*) FROM "AdImpression" GROUP BY event ORDER BY count(*) DESC;
SELECT c.name, c.advertiser, c."budgetCents"/100.0 AS budget_usd, c.status,
       count(DISTINCT ai.id) AS total_impressions
FROM "AdCampaign" c
LEFT JOIN "AdPlacement" p ON p."campaignId" = c.id
LEFT JOIN "AdImpression" ai ON ai."placementId" = p.id
GROUP BY c.id
ORDER BY total_impressions DESC;
