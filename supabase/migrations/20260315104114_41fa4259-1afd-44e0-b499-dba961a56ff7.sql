
-- Create storage bucket for lesson files
INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-files', 'lesson-files', true);

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload lesson files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'lesson-files');

-- Allow everyone to view lesson files
CREATE POLICY "Anyone can view lesson files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'lesson-files');

-- Allow teachers to delete their own files
CREATE POLICY "Users can delete own lesson files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'lesson-files' AND (storage.foldername(name))[1] = auth.uid()::text);
