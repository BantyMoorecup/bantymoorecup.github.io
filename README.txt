# Banty Moore Prestige Cup — MVP starter

## Included
- `index.html`: branded homepage with registration countdown.
- `registration.html`: player submission prototype.
- `admin.html`: browser prototype for player approvals, goal/card entry, and team overview.
- `supabase_schema.sql`: starting database schema for a future Supabase connection.

## Important
This is a prototype, not a published website and not safe for live tournament use yet.
The HTML prototype stores test data in the current browser's local storage. It does not sync between users or devices, and it has no real login/security.
Do not enter sensitive personal information into the prototype.

## Next production steps
1. Create a Supabase project using your own account.
2. Review the schema and apply it to the project's SQL editor.
3. Configure authentication and row-level security policies before collecting real registrations.
4. Add server-side deadline enforcement for Thursday, 5 November 2026 at 7:00 PM Nigeria time.
5. Connect the pages to Supabase and deploy the site to a free host.
6. Test admin/manager permissions using separate accounts before sharing the site publicly.

Never put a Supabase service-role key in public browser code.
