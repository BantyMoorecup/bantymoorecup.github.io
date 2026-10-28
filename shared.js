window.BANTY = {
  deadline: new Date(window.BANTY_REGISTRATION_DEADLINE || "2026-11-05T19:00:00+01:00"),
  esc(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  async ready() {
    if (!window.bantySupabase) throw new Error("Website database is not configured yet.");
    return window.bantySupabase;
  },
  async adminCheck(client) {
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return { user: null, admin: false };
    const { data, error: e } = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    return { user, admin: !e && !!data };
  },
  message(el, text, bad=false) { el.textContent=text; el.className=bad ? "notice error" : "notice"; }
};
