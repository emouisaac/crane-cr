ALTER TABLE accounts
ADD COLUMN IF NOT EXISTS admin_role TEXT;

UPDATE accounts
SET admin_role = 'manager'
WHERE role = 'admin' AND (admin_role IS NULL OR admin_role = '');

ALTER TABLE accounts
DROP CONSTRAINT IF EXISTS accounts_admin_role_check;

ALTER TABLE accounts
ADD CONSTRAINT accounts_admin_role_check
CHECK (
  admin_role IS NULL
  OR admin_role IN (
    'manager',
    'secretary',
    'loan_officer',
    'contact_support',
    'analyst',
    'compliance_officer',
    'recovery_officer',
    'cashier'
  )
);

CREATE INDEX IF NOT EXISTS idx_accounts_admin_role ON accounts(admin_role);
