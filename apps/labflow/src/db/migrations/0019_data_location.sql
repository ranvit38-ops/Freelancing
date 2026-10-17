-- Where an experiment's original data lives when it is not uploaded: the
-- instrument PC, a shared drive, the lab NAS. Raw files are often too large or
-- too numerous to upload, and the question a PI actually asks is "where is it".
alter table experiments add column if not exists data_location text;
