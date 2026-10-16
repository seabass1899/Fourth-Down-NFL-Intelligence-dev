-- FourthDown P0.2-HF2: profile creation on signup + idempotent backfill.
-- Apply only to the intended development Supabase project after reviewing.
-- Existing profile read/update RLS policies from foundation migration remain in effect.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
 INSERT INTO public.profiles(id, display_name)
 VALUES (NEW.id, COALESCE(NULLIF(LEFT(TRIM(NEW.raw_user_meta_data ->> 'display_name'),60),''),'FourthDown Member'))
 ON CONFLICT(id) DO NOTHING;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO public.profiles(id,display_name)
SELECT id, COALESCE(NULLIF(LEFT(TRIM(raw_user_meta_data ->> 'display_name'),60),''),'FourthDown Member')
FROM auth.users ON CONFLICT(id) DO NOTHING;
