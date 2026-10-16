-- FourthDown P0.2 - Wager Ownership Integrity
-- Ensures that every wager leg belongs to
-- the same authenticated user as its parent wager.
-- Safe to rerun when the expected constraints
-- already exist.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.wagers'::regclass
          AND conname = 'wagers_id_user_id_unique'
    ) THEN
        ALTER TABLE public.wagers
        ADD CONSTRAINT wagers_id_user_id_unique
        UNIQUE (id, user_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.wager_legs'::regclass
          AND conname = 'wager_legs_owner_match_fkey'
    ) THEN
        ALTER TABLE public.wager_legs
        ADD CONSTRAINT wager_legs_owner_match_fkey
        FOREIGN KEY (wager_id, user_id)
        REFERENCES public.wagers (id, user_id)
        ON DELETE CASCADE;
    END IF;
END
$$;

COMMIT;