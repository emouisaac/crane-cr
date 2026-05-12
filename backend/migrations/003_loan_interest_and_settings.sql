ALTER TABLE loan_applications
ADD COLUMN IF NOT EXISTS interest_rate NUMERIC(5, 2);

UPDATE loan_applications
SET interest_rate = 17
WHERE interest_rate IS NULL;

ALTER TABLE loan_applications
ALTER COLUMN interest_rate SET DEFAULT 17;

ALTER TABLE loan_applications
ALTER COLUMN interest_rate SET NOT NULL;

INSERT INTO app_settings (key, value)
VALUES ('defaultInterestRate', '17'::jsonb)
ON CONFLICT (key) DO NOTHING;
