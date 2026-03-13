-- Make 'card-images' bucket public and set up access policy
UPDATE storage.buckets 
SET public = TRUE 
WHERE id = 'card-images';

-- Allow anyone to read images from the bucket (public access)
CREATE POLICY "card_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'card-images');
