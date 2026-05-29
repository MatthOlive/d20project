CREATE POLICY "authenticated read pokerole2"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'pokerole2');