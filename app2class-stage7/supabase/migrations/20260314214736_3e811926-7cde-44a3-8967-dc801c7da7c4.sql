DO $$
DECLARE
  sid uuid := '64bab769-2a33-4ed9-a269-8f711c916731';
  sysuser uuid := '00000000-0000-0000-0000-000000000000';
BEGIN

INSERT INTO grade_events (school_id, grade, event_date, title, event_type, subject, status, proposed_by) VALUES
(sid, 'יא', '2025-12-01', 'אשכול ב׳ (ללא תנ"ך מורחב) 0-2', 'exam', 'אשכול ב׳', 'approved', sysuser),
(sid, 'יא', '2025-12-03', 'ערב הורים', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2025-12-04', 'ספרות 1-3', 'exam', 'ספרות', 'approved', sysuser),
(sid, 'יא', '2025-12-07', 'ערב הורים', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2025-12-07', 'אשכול א׳ סוציו׳, מידע ונתונים, ערבית 0-2', 'exam', 'אשכול א׳', 'approved', sysuser),
(sid, 'יא', '2025-12-09', 'מתמטיקה 5 יח"ל 0-2, 3+4 יח"ל 1-2', 'exam', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2025-12-10', 'הכנה ליום המאה', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2025-12-14', 'מעבדה חמד"ע', 'event', 'חמד"ע', 'approved', sysuser),
(sid, 'יא', '2025-12-15', 'עברית 2-3', 'exam', 'עברית', 'approved', sysuser),
(sid, 'יא', '2025-12-23', 'הגשת עבודת חקר - תנ"ך מורחב', 'deadline', 'תנ"ך', 'approved', sysuser),
(sid, 'יא', '2025-12-24', 'אשכול א׳ אדריכלות, אמנות, ביול׳, ג"ג, פסיכו׳, תקשורת, צרפתית, חמד"ע 3-4', 'exam', 'אשכול א׳', 'approved', sysuser),
(sid, 'יא', '2025-12-25', 'בוחן בקיאות ספרות', 'quiz', 'ספרות', 'approved', sysuser),
(sid, 'יא', '2025-12-28', 'מועדי ב׳ מתמטיקה', 'exam', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2025-12-29', 'מועדי ב׳ אנגלית', 'exam', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2025-12-30', 'מועדי ב׳ מדעים ומדמ"ח', 'exam', 'מדעים', 'approved', sysuser),
(sid, 'יא', '2025-12-31', 'מועד ב׳ רבי מלל / דור האלכוהול 2 סבבים', 'exam', NULL, 'approved', sysuser);

INSERT INTO grade_events (school_id, grade, event_date, title, event_type, subject, status, proposed_by) VALUES
(sid, 'יא', '2026-01-01', 'חצי גמר', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-01-04', 'מעבדה חמד"ע', 'event', 'חמד"ע', 'approved', sysuser),
(sid, 'יא', '2026-01-05', 'סמינר יוזמות אברהם-רמלה', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-01-06', 'סמינר יוזמות אברהם-רמלה', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-01-07', 'גמר', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-01-12', 'מתכונת מודול E', 'exam', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2026-01-14', 'סמינר תקשורת + מידע ונתונים', 'event', 'תקשורת', 'approved', sysuser),
(sid, 'יא', '2026-01-15', 'סמינר תקשורת + ג"ג', 'event', 'תקשורת', 'approved', sysuser),
(sid, 'יא', '2026-01-21', 'בוחן עברית 1-2', 'quiz', 'עברית', 'approved', sysuser),
(sid, 'יא', '2026-01-21', 'יום קולנוע צרפתי 13:00-17:00', 'event', 'צרפתית', 'approved', sysuser),
(sid, 'יא', '2026-01-22', 'סיפור ישראלי מוזיאון א"י', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-01-25', 'יום שיא מקצועות אשכול ב׳', 'event', 'אשכול ב׳', 'approved', sysuser),
(sid, 'יא', '2026-01-26', 'בגרות מצטיינים מודול E, מבחן מעבר רמות', 'bagrut', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2026-01-28', 'מבחן מתמטיקה שעות 5-9', 'exam', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2026-01-29', 'חלוקת תעודות ז׳-י"א', 'event', NULL, 'approved', sysuser);

INSERT INTO grade_events (school_id, grade, event_date, title, event_type, subject, status, proposed_by) VALUES
(sid, 'יא', '2026-02-01', 'אשכול א׳ 0-2 ביולו׳, ג"ג, סוציו׳, חמד"ע, צרפתית, תקשורת + בוחן מידע ונתונים', 'exam', 'אשכול א׳', 'approved', sysuser),
(sid, 'יא', '2026-02-02', 'לקראת פסיכומטרי שעות 3-4', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-02-03', 'מבחן אשכול ב׳ 5-6 + מבחן הסטוריה י"א 1+3+9', 'exam', 'אשכול ב׳', 'approved', sysuser),
(sid, 'יא', '2026-02-05', 'מבחן ספרות 0-2 + סדנאות רובוטיקה', 'exam', 'ספרות', 'approved', sysuser),
(sid, 'יא', '2026-02-08', 'מבחן פסיכולוגיה, מידע ונתונים, ערבית, יום שיא הסטוריה מורחב', 'exam', 'פסיכולוגיה', 'approved', sysuser),
(sid, 'יא', '2026-02-09', 'מבחן אמנות 7-8, יום הכנה לטיול', 'exam', 'אמנות', 'approved', sysuser),
(sid, 'יא', '2026-02-10', 'מסע משמעותי י"א', 'trip', NULL, 'approved', sysuser),
(sid, 'יא', '2026-02-11', 'מסע משמעותי י"א', 'trip', NULL, 'approved', sysuser),
(sid, 'יא', '2026-02-12', 'מסע משמעותי י"א', 'trip', NULL, 'approved', sysuser),
(sid, 'יא', '2026-02-15', 'בוחן בקיאות - חוק מקראי', 'quiz', 'תנ"ך', 'approved', sysuser),
(sid, 'יא', '2026-02-16', 'סדנאות רובוטיקה הר נבו', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-02-19', 'טרום מתכונת עברית', 'exam', 'עברית', 'approved', sysuser),
(sid, 'יא', '2026-02-23', 'מבחן אנגלית 4-5', 'exam', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2026-02-25', 'מתמטיקה 5-9', 'exam', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2026-02-26', 'הרצאה - אפקט הפורנו', 'event', NULL, 'approved', sysuser);

INSERT INTO grade_events (school_id, grade, event_date, title, event_type, subject, status, proposed_by) VALUES
(sid, 'יא', '2026-03-01', 'פורימון', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-03-02', 'בוחן באנגלית 4-5', 'quiz', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2026-03-06', 'מועדי ב׳ במקצועות המדעיים ומדמ"ח', 'exam', 'מדעים', 'approved', sysuser),
(sid, 'יא', '2026-03-08', 'ערב הורים', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-03-09', 'מועד ב׳ מתמטיקה', 'exam', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2026-03-10', 'מועד ב׳ רבי מלל', 'exam', NULL, 'approved', sysuser),
(sid, 'יא', '2026-03-11', 'מועד ב׳ אנגלית', 'exam', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2026-03-12', 'בוחן ספרות 1-2 + מבחן מסכם חנ"ג', 'exam', 'ספרות', 'approved', sysuser),
(sid, 'יא', '2026-03-15', 'בוחן אשכול א׳ 0-2 + מבחן חמד"ע', 'exam', 'אשכול א׳', 'approved', sysuser),
(sid, 'יא', '2026-03-17', 'בוחן אשכול ב׳ (ללא ביולו׳ + הסטוריה)', 'exam', 'אשכול ב׳', 'approved', sysuser),
(sid, 'יא', '2026-03-18', 'ערב הורים', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-03-19', 'שיפור ציון 1', 'exam', NULL, 'approved', sysuser),
(sid, 'יא', '2026-03-20', 'שיפור ציון 2', 'exam', NULL, 'approved', sysuser),
(sid, 'יא', '2026-03-22', 'מתכונת עברית 8:00-12:00', 'exam', 'עברית', 'approved', sysuser),
(sid, 'יא', '2026-03-24', 'שיפור ציון 3', 'exam', NULL, 'approved', sysuser);

INSERT INTO grade_events (school_id, grade, event_date, title, event_type, subject, status, proposed_by) VALUES
(sid, 'יא', '2026-04-09', 'אסרו חג - סיור מגמת ערבית + הגשת פודקאסט תנ"ך', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-04-12', 'מתכונת 1 מתמטיקה', 'exam', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2026-04-13', 'סיור בעוטף', 'trip', NULL, 'approved', sysuser),
(sid, 'יא', '2026-04-14', 'יום הזיכרון לשואה ולגבורה', 'ceremony', NULL, 'approved', sysuser),
(sid, 'יא', '2026-04-16', 'מתכונת אנגלית', 'exam', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2026-04-19', 'מתכונת 2 מתמטיקה', 'exam', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2026-04-20', 'ערב יום הזיכרון לחללי צה"ל', 'ceremony', NULL, 'approved', sysuser),
(sid, 'יא', '2026-04-21', 'יום הזיכרון וערב יום העצמאות', 'ceremony', NULL, 'approved', sysuser),
(sid, 'יא', '2026-04-24', 'מתכונת פיזיקה חמד"ע', 'exam', 'פיזיקה', 'approved', sysuser),
(sid, 'יא', '2026-04-26', 'מבחן ספרות', 'exam', 'ספרות', 'approved', sysuser),
(sid, 'יא', '2026-04-28', 'בוחן ביולוגיה - 2 אשכולות', 'exam', 'ביולוגיה', 'approved', sysuser),
(sid, 'יא', '2026-04-30', 'מתכונת היסטוריה + בוחן כימיה + מתכונת ספרות מורחב', 'exam', 'היסטוריה', 'approved', sysuser);

INSERT INTO grade_events (school_id, grade, event_date, title, event_type, subject, status, proposed_by) VALUES
(sid, 'יא', '2026-05-03', 'מידע ונתונים - הדמייה', 'event', 'מידע ונתונים', 'approved', sysuser),
(sid, 'יא', '2026-05-04', 'מתכונת אדריכלות + מבחן מסכם סוציולוגיה', 'exam', 'אדריכלות', 'approved', sysuser),
(sid, 'יא', '2026-05-05', 'ל"ג בעומר - יום לימודים', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-05-07', 'בגרות עברית', 'bagrut', 'עברית', 'approved', sysuser),
(sid, 'יא', '2026-05-12', 'בגרות מתמטיקה', 'bagrut', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2026-05-13', 'בגרות מתמטיקה', 'bagrut', 'מתמטיקה', 'approved', sysuser),
(sid, 'יא', '2026-05-18', 'בגרות אנגלית A+E', 'bagrut', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2026-05-19', 'בגרות אנגלית C+G', 'bagrut', 'אנגלית', 'approved', sysuser),
(sid, 'יא', '2026-05-24', 'מתכונת פיזיקה + מתכונת כימיה', 'exam', 'פיזיקה', 'approved', sysuser),
(sid, 'יא', '2026-05-26', 'בגרות ספרות מורחב', 'bagrut', 'ספרות', 'approved', sysuser),
(sid, 'יא', '2026-05-28', 'מבחן מסכם היסטוריה י"א', 'exam', 'היסטוריה', 'approved', sysuser),
(sid, 'יא', '2026-05-31', 'מתכונת מדמ"ח', 'exam', 'מדמ"ח', 'approved', sysuser);

INSERT INTO grade_events (school_id, grade, event_date, title, event_type, subject, status, proposed_by) VALUES
(sid, 'יא', '2026-06-01', 'היסטוריה 1+3+9', 'exam', 'היסטוריה', 'approved', sysuser),
(sid, 'יא', '2026-06-04', 'בגרות אדריכלות + מתכונת מידע ונתונים', 'bagrut', 'אדריכלות', 'approved', sysuser),
(sid, 'יא', '2026-06-07', 'מבחן פנימי מדמ"ח', 'exam', 'מדמ"ח', 'approved', sysuser),
(sid, 'יא', '2026-06-08', 'מבחן פנימי מדמ"ח', 'exam', 'מדמ"ח', 'approved', sysuser),
(sid, 'יא', '2026-06-11', 'מבחן מסכם ספרות', 'exam', 'ספרות', 'approved', sysuser),
(sid, 'יא', '2026-06-13', 'מועד הגשת דף מקורות מגילת רות', 'deadline', 'תנ"ך', 'approved', sysuser),
(sid, 'יא', '2026-06-15', 'בגרות פיזיקה', 'bagrut', 'פיזיקה', 'approved', sysuser),
(sid, 'יא', '2026-06-18', 'חלוקת תעודות', 'event', NULL, 'approved', sysuser),
(sid, 'יא', '2026-06-22', 'בגרות כימיה', 'bagrut', 'כימיה', 'approved', sysuser),
(sid, 'יא', '2026-06-25', 'בגרות מדמ"ח + בגרות מידע ונתונים', 'bagrut', 'מדמ"ח', 'approved', sysuser);

END $$;