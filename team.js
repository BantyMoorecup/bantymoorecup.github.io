(async function () {
  const $ = id => document.getElementById(id);

  const empty = msg =>
    `<p class="muted">${BANTY.esc(msg)}</p>`;

  const table = (headers, rows) =>
    rows.length
      ? `<table>
          <thead><tr>${headers.map(h =>
            `<th>${BANTY.esc(h)}</th>`
          ).join("")}</tr></thead>
          <tbody>${rows.join("")}</tbody>
        </table>`
      : empty("No fixtures available yet.");

  const kickoff = value => {
    if (!value) return "TBC";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TBC";

    return BANTY.esc(
      new Intl.DateTimeFormat("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Lagos"
      }).format(date)
    );
  };

  try {
    const teamId = new URLSearchParams(
      window.location.search
    ).get("id");

    if (!teamId) {
      throw new Error("No team selected. Return to the overview and choose a team.");
    }

    const client = await BANTY.ready();

    const [
      { data: team, error: teamError },
      { data: teams, error: teamsError },
      { data: players, error: playersError },
      { data: matches, error: matchesError },
      { data: allMatches, error: allMatchesError }
    ] = await Promise.all([
      client.from("teams")
        .select("id,name")
        .eq("id", teamId)
        .maybeSingle(),

      client.from("teams")
        .select("id,name")
        .order("name"),

      client.from("players")
        .select("id,team_id,full_name,jersey_number")
        .eq("team_id", teamId)
        .eq("registration_status", "approved")
        .order("jersey_number"),

      client.from("matches")
        .select("id,home_team_id,away_team_id,kickoff,venue,home_score,away_score,status")
        .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
        .order("kickoff"),

      client.from("matches")
        .select("home_team_id,away_team_id,home_score,away_score,status")
    ]);

    if (
      teamError || teamsError || playersError ||
      matchesError || allMatchesError
    ) {
      throw new Error("Unable to load team information. Check Supabase policies.");
    }

    if (!team) throw new Error("Team not found.");

    const teamNames = Object.fromEntries(
      (teams || []).map(t => [t.id, t.name])
    );

    $("team-name").textContent = team.name;
    $("team-message").textContent =
      "Banty Moore Prestige Cup team profile";

    document.title =
      `${team.name} | Banty Moore Prestige Cup`;

    // Calculate the league table from played matches.
    const standings = {};

    (teams || []).forEach(t => {
      standings[t.id] = {
        id: t.id,
        name: t.name,
        p: 0, w: 0, d: 0, l: 0,
        gf: 0, ga: 0, pts: 0
      };
    });

    (allMatches || [])
      .filter(m =>
        m.status === "played" &&
        m.home_score != null &&
        m.away_score != null
      )
      .forEach(m => {
        const home = standings[m.home_team_id];
        const away = standings[m.away_team_id];

        if (!home || !away) return;

        const hs = Number(m.home_score);
        const as = Number(m.away_score);

        home.p++;
        away.p++;

        home.gf += hs;
        home.ga += as;
        away.gf += as;
        away.ga += hs;

        if (hs > as) {
          home.w++;
          away.l++;
          home.pts += 3;
        } else if (hs < as) {
          away.w++;
          home.l++;
          away.pts += 3;
        } else {
          home.d++;
          away.d++;
          home.pts++;
          away.pts++;
        }
      });

    const ranking = Object.values(standings).sort(
      (a, b) =>
        b.pts - a.pts ||
        (b.gf - b.ga) - (a.gf - a.ga) ||
        b.gf - a.gf ||
        a.name.localeCompare(b.name)
    );

    const stats = standings[teamId];
    const position =
      ranking.findIndex(t => t.id === teamId) + 1;

    const values = [
      ["POS", position],
      ["P", stats.p],
      ["W", stats.w],
      ["D", stats.d],
      ["L", stats.l],
      ["GF", stats.gf],
      ["GA", stats.ga],
      ["PTS", stats.pts]
    ];

    $("team-stats").innerHTML = values.map(([label, value]) => `
      <div class="team-stat">
        <span>${BANTY.esc(label)}</span>
        <strong>${BANTY.esc(value)}</strong>
      </div>
    `).join("");

    // Fixtures and results.
    $("team-matches").innerHTML = table(
      ["Match", "Kick-off", "Venue", "Score", "Status"],

      (matches || []).map(m => {
        const home =
          teamNames[m.home_team_id] || "TBD";
        const away =
          teamNames[m.away_team_id] || "TBD";

        const score =
          m.status === "played" &&
          m.home_score != null &&
          m.away_score != null
            ? `${BANTY.esc(m.home_score)} – ${BANTY.esc(m.away_score)}`
            : "—";

        return `
          <tr>
            <td>${BANTY.esc(home)} vs ${BANTY.esc(away)}</td>
            <td>${kickoff(m.kickoff)}</td>
            <td>${BANTY.esc(m.venue || "TBC")}</td>
            <td>${score}</td>
            <td>${BANTY.esc(m.status || "scheduled")}</td>
          </tr>
        `;
      })
    );

    // Approved roster only.
    $("team-roster").innerHTML =
      (players || []).length
        ? `<div class="roster-grid">
            ${players.map(p => `
              <div class="roster-player">
                <span class="roster-number">
                  ${p.jersey_number == null
                    ? "—"
                    : `#${BANTY.esc(p.jersey_number)}`}
                </span>
                <strong>${BANTY.esc(p.full_name)}</strong>
              </div>
            `).join("")}
          </div>`
        : empty("No approved players yet.");

  } catch (error) {
    const message = error?.message ||
      "Unable to load this team profile.";

    $("team-name").textContent =
      "Team profile unavailable";

    $("team-message").textContent = message;

    ["team-stats", "team-matches", "team-roster"]
      .forEach(id => {
        $(id).innerHTML = empty(message);
      });

    console.error(error);
  }
})();
