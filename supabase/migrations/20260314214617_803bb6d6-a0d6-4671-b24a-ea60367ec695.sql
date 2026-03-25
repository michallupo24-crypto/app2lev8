-- Expand event_type check to support school calendar event types
ALTER TABLE grade_events DROP CONSTRAINT grade_events_event_type_check;
ALTER TABLE grade_events ADD CONSTRAINT grade_events_event_type_check 
  CHECK (event_type = ANY (ARRAY['exam','trip','ceremony','activity','tutoring','meeting','other','event','quiz','deadline','bagrut']));