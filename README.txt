BANTY MOORE PRESTIGE CUP — UPDATE PACKAGE

IMPORTANT
- Keep the currently published site online until these files are uploaded and tested.
- This package is designed for the existing Supabase project:
  https://thibnmsekeqvdsxlwffo.supabase.co
- Before uploading, replace the placeholder in supabase-config.js with your Supabase publishable key.
- Never put a Supabase service_role/secret key in website files.
- Admin sign-in uses Supabase Auth. Only the user ID listed in public.admin_users can perform admin actions.
- Registration deadline is set to 2026-11-05 19:00 Africa/Lagos in the database function.
- Managers receive a team-specific URL containing a registration token. Anyone with that link can use it, so share each link privately.

SETUP ORDER
1. Run supabase_setup.sql in Supabase SQL Editor, one statement at a time if the editor rejects multi-statement SQL. Read comments.
2. Create an admin user in Supabase Authentication using the admin email, then insert that user's UUID into public.admin_users.
3. Add the real publishable key to supabase-config.js.
4. Upload the files to the existing GitHub Pages repository root.
5. Test with one sample team before sharing registration links.

NOTE
The package includes working front-end pages and database functions, but the real deployment must be tested in your Supabase project before being used for the tournament.
