(function () {
  if (!window.supabase) {
    console.error("Supabase library has not loaded.");
    return;
  }

  if (
    typeof SUPABASE_URL === "undefined" ||
    typeof SUPABASE_PUBLISHABLE_KEY === "undefined"
  ) {
    console.error("Supabase configuration is missing.");
    return;
  }

  window.bantySupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  console.log("Banty Moore Supabase client initialized.");
})();
