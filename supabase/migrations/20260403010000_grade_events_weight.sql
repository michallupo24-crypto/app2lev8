-- Add weight and semester to grade_events table
ALTER TABLE public.grade_events
ADD COLUMN weight SMALLINT,
ADD COLUMN semester SMALLINT DEFAULT 1;

-- Add constraint to ensure weight is between 0 and 100
ALTER TABLE public.grade_events
ADD CONSTRAINT check_weight_percentage CHECK (weight >= 0 AND weight <= 100);

-- Since max weight checking relies on SUM() of weights per subject per semester per school,
-- we'll enforce that logical constraint in the application layer OR via a trigger.
-- For safety, here's a trigger function to block exams exceeding 100% total weight for a subject in a semester.

CREATE OR REPLACE FUNCTION check_max_subject_weight()
RETURNS trigger AS $$
DECLARE
  current_total SMALLINT;
BEGIN
  -- Only care about exams that have a weight and a subject
  IF NEW.event_type = 'exam' AND NEW.subject IS NOT NULL AND NEW.weight IS NOT NULL THEN
    
    -- Calculate the sum of weights for this subject in this school, grade, and semester
    -- Excluding the current row (if it's an update)
    SELECT COALESCE(SUM(weight), 0) INTO current_total
    FROM public.grade_events
    WHERE school_id = NEW.school_id
      AND grade = NEW.grade
      AND subject = NEW.subject
      AND semester = NEW.semester
      AND event_type = 'exam'
      AND id != NEW.id;
      
    -- Check if adding the new weight exceeds 100
    IF (current_total + NEW.weight) > 100 THEN
      RAISE EXCEPTION 'Total weight for subject % in semester % cannot exceed 100%%. Current total: %%%, attempted to add %%%.', 
        NEW.subject, NEW.semester, current_total, NEW.weight;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_max_subject_weight
BEFORE INSERT OR UPDATE ON public.grade_events
FOR EACH ROW EXECUTE FUNCTION check_max_subject_weight();
