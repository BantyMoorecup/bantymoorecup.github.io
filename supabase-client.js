(function () {
  if (!window.supabase || !window.BANTY_SUPABASE_URL ||
      !window.BANTY_SUPABASE_PUBLISHABLE_KEY ||
      window.BANTY_SUPABASE_PUBLISHABLE_KEY === "PASTE_YOUR_PUBLISHABLE_KEY_HERE") {
    console.error("Supabase is not configured. Check supabase-config.js.");
    return;
  }
  window.bantySupabase = window.supabase.createClient(
    window.BANTY_SUPABASE_URL,
    window.BANTY_SUPABASE_PUBLISHABLE_KEY
  );
})();
