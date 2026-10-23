-- Abstracts for saved papers, so LabBot can be given what the paper actually
-- says rather than only its title. Idempotent.
ALTER TABLE literature_refs ADD COLUMN IF NOT EXISTS abstract text;
