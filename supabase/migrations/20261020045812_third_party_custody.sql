-- Custody movements affect bank cash but are neither sales nor operating expenses.
-- Keep the enum additions separate from functions that use them: PostgreSQL
-- cannot use a new enum value before the adding transaction commits.
alter type public.journal_entry_type add value if not exists 'custody_in';
alter type public.journal_entry_type add value if not exists 'custody_out';
