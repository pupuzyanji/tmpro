-- v030.C — a small thumbnail of each portrait photo, used by every staff
-- list, tile and avatar instead of the full-size photo. The API fills it
-- in (and shrinks oversized photos) for existing employees shortly after
-- it starts; new uploads are processed as they arrive.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_thumb text;
