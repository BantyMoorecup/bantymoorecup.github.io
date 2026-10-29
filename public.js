(async function () {
  const $ = id => document.getElementById(id);

  const empty = (msg = "No data published yet.") =>
    `<p class="muted">${BANTY.esc(msg)}</p>`;

  const table = (heads, rows) =>
    rows.length
      ? `<table><thead><tr>${heads.map(h =>
          `<th>${BANTY.esc(h)}</th>`
        ).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`
      : empty();

  const teamLink = (id, name) =>
    `<a href="team.html?id=${encodeURIComponent(id)}">${BANTY.esc(name)}</a>`;

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
    const c = await BANTY.ready();

    const [
      { data: teams, error: te },
      { data: players, error: pe },
      { data: matches, error: me },
      { data: goals, error: ge },
      { data: cards, error: ce }
    ] = await Promise.all([
      c.from("teams").select("id,name").order("name"),
      c.from("players")
        .select("id,team_id,full_name,jersey_number")
        .eq("registration_status", "approved"),
      c.from("matches")
        .select("id,home_team_id,away_team_id,kickoff,venue,home_score,away_score,status")
        .order("kickoff"),
      c.from("goals").select("player_id,match_id"),
      c.from("cards").select("player_id,match_id,card_type")
    ]);

    if (te || pe || me || ge || ce) {
      throw new Error(
        "Could not load tournament data. Check database setup and policies."
      );
    }

    const tm = Object.fromEntries(
      (teams || []).map(t => [t.id, t.name])
    );

    const pl = Object.fromEntries(
      (players || []).map(p => [p.id, p])
    );

    // Calculate league standings.
    const standings = {};

    (teams || []).forEach(t => {
      standings[t.id] = {
        id: t.id,
        name: t.name,
        p: 0,
        w: 0,
        d: 0,
        l: 0,
        gf: 0,
        ga: 0,
        pts: 0
      };
    });

    (matches || [])
      .filter(m =>
        m.status === "played" &&
        m.home_score != null &&
        m.away_score != null
      )
      .forEach(m => {
        const h = standings[m.home_team_id];
        const a = standings[m.away_team_id];

        if (!h || !a) return;

        const hs = Number(m.home_score);
        const as = Number(m.away_score);

        h.p++;
        a.p++;

        h.gf += hs;
        h.ga += as;
        a.gf += as;
        a.ga += hs;

        if (hs > as) {
          h.w++;
          a.l++;
          h.pts += 3;
        } else if (hs < as) {
          a.w++;
          h.l++;
          a.pts += 3;
        } else {
          h.d++;
          a.d++;
          h.pts++;
          a.pts++;
        }
      });

    const ordered = Object.values(standings).sort(
      (a, b) =>
        b.pts - a.pts ||
        (b.gf - b.ga) - (a.gf - a.ga) ||
        b.gf - a.gf ||
        a.name.localeCompare(b.name)
    );

    $("league").innerHTML = table(
      ["#", "Team", "P", "W", "D", "L", "GD", "Pts"],
      ordered.map((s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${teamLink(s.id, s.name)}</td>
          <td>${s.p}</td>
          <td>${s.w}</td>
          <td>${s.d}</td>
          <td>${s.l}</td>
          <td>${s.gf - s.ga}</td>
          <td><b>${s.pts}</b></td>
        </tr>
      `)
    );

    // Calculate goals per approved player.
    const counts = {};

    (goals || []).forEach(g => {
      if (pl[g.player_id]) {
        counts[g.player_id] = (counts[g.player_id] || 0) + 1;
      }
    });

    $("scorers").innerHTML = table(
      ["Player", "Team", "Goals"],
      Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => `
          <tr>
            <td>${BANTY.esc(pl[id].full_name)}</td>
            <td>${teamLink(
              pl[id].team_id,
              tm[pl[id].team_id] || "Unknown team"
            )}</td>
            <td>${n}</td>
          </tr>
        `)
    );

    // Calculate yellow and red cards.
    const cc = {};

    (cards || []).forEach(card => {
      if (!pl[card.player_id]) return;

      const id = card.player_id;
      cc[id] ??= { y: 0, r: 0 };

      if (card.card_type === "yellow") {
        cc[id].y++;
      } else if (card.card_type === "red") {
        cc[id].r++;
      }
    });

    $("cards").innerHTML = table(
      ["Player", "Team", "Yellow", "Red"],
      Object.entries(cc)
        .sort((a, b) =>
          b[1].r - a[1].r || b[1].y - a[1].y
        )
        .map(([id, v]) => `
          <tr>
            <td>${BANTY.esc(pl[id].full_name)}</td>
            <td>${teamLink(
              pl[id].team_id,
              tm[pl[id].team_id] || "Unknown team"
            )}</td>
            <td>${v.y}</td>
            <td>${v.r}</td>
          </tr>
        `)
    );

    // Fixtures and results.
    $("matches").innerHTML = table(
      ["Match", "Kick-off", "Venue", "Score", "Status"],
      (matches || []).map(m => `
        <tr>
          <td>
            ${teamLink(
              m.home_team_id,
              tm[m.home_team_id] || "TBD"
            )}
            vs
            ${teamLink(
              m.away_team_id,
              tm[m.away_team_id] || "TBD"
            )}
          </td>
          <td>${kickoff(m.kickoff)}</td>
          <td>${BANTY.esc(m.venue || "TBC")}</td>
          <td>${
            m.status === "played" &&
            m.home_score != null &&
            m.away_score != null
              ? `${BANTY.esc(m.home_score)} – ${BANTY.esc(m.away_score)}`
              : "—"
          }</td>
          <td>${BANTY.esc(m.status || "scheduled")}</td>
        </tr>
      `)
    );

    // Teams and approved players.
    $("teams").innerHTML =
      (teams || []).map(t => `
        <div class="panel">
          <h3>${teamLink(t.id, t.name)}</h3>
          <ul>
            ${(players || [])
              .filter(p => p.team_id === t.id)
              .map(p => `
                <li>
                  ${BANTY.esc(p.full_name)}
                  ${p.jersey_number != null
                    ? ` (#${BANTY.esc(p.jersey_number)})`
                    : ""}
                </li>
              `).join("") ||
              '<li class="muted">No approved players yet</li>'}
          </ul>
          <p>
            <a class="button" href="team.html?id=${encodeURIComponent(t.id)}">
              View team profile
            </a>
          </p>
        </div>
      `).join("") || empty();

  } catch (e) {
    ["league", "scorers", "cards", "matches", "teams"].forEach(id => {
      $(id).innerHTML = empty(
        e.message || "Site setup is not complete."
      );
    });

    console.error(e);
  }
})();
