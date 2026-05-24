-- FoodFusion analyzes scan photos transiently and does not retain image storage references.
alter table public.scans
  drop column if exists image_retained,
  drop column if exists image_object_path;

comment on table public.scans is 'Structured scan results only. FoodFusion does not retain captured images.';
