
(function () {
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

  // Get the match date using Nigeria local time.
  const dateKey = value => {
    if (!value) return "TBC";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TBC";

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const part = type =>
      parts.find(item => item.type === type)?.value;

    return `${part("year")}-${part("month")}-${part("day")}`;
  };

  // Display a full date heading for each matchday.
  const dateHeading = value => {
    if (value === "TBC") return "DATE TO BE CONFIRMED";

    const [year, month, day] = value.split("-").map(Number);

    const date = new Date(Date.UTC(year, month - 1, day, 12));

    return new Intl.DateTimeFormat("en-NG", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC"
    }).format(date).toUpperCase();
  };

  try {
    async function loadTournament() {
      const c = await BANTY.ready();

      const [
        { data: teams, error: te },
        { data: players, error: pe },
        { data: matches, error: me },
        { data: goals, error: ge },
        { data: cards, error: ce },
        { data: assignments, error: ae },
        { data: drawSettings, error: de }
      ] = await Promise.all([
        c.from("teams").select("id,name").order("name"),
        c.from("players")
          .select("id,team_id,full_name,jersey_number")
          .eq("registration_status", "approved"),
        c.from("matches")
          .select("id,home_team_id,away_team_id,kickoff,venue,home_score,away_score,status")
          .order("kickoff"),
        c.from("goals").select("player_id,match_id"),
        c.from("cards").select("player_id,match_id,card_type"),
        c.from("tournament_group_assignments").select("team_id,group_name"),
        c.from("tournament_draw_settings")
          .select("is_published")
          .eq("id", true)
          .maybeSingle()
      ]);

      if (te || pe || me || ge || ce || ae || de) {
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

      // Calculate standings for all teams.
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

      // Separate standings into Groups A-F.
      const drawPublished = drawSettings?.is_published === true;
      const groupAssignments = assignments || [];

      const teamGroup = Object.fromEntries(
        groupAssignments.map(item => [
          String(item.team_id),
          item.group_name
        ])
      );

      if (!drawPublished) {
        $("league").innerHTML = empty(
          "The group draw has not been published yet."
        );
      } else {
        $("league").innerHTML = ["A", "B", "C", "D", "E", "F"]
          .map(group => {
            const groupTeams = ordered.filter(
              team => teamGroup[String(team.id)] === group
            );

            return `
              <section class="group-table panel">
                <h3>GROUP ${group}</h3>

                ${table(
                  ["#", "Team", "P", "W", "D", "L", "GD", "Pts"],
                  groupTeams.map((team, index) => `
                    <tr>
                      <td>${index + 1}</td>
                      <td>${teamLink(team.id, team.name)}</td>
                      <td>${team.p}</td>
                      <td>${team.w}</td>
                      <td>${team.d}</td>
                      <td>${team.l}</td>
                      <td>${team.gf - team.ga}</td>
                      <td><b>${team.pts}</b></td>
                    </tr>
                  `)
                )}
              </section>
            `;
          })
          .join("");
      }

      // Top scorers.
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

      // Yellow and red cards.
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

      // Fixtures grouped by match date.
      const matchGroups = {};

      (matches || []).forEach(m => {
        const key = dateKey(m.kickoff);

        if (!matchGroups[key]) {
          matchGroups[key] = [];
        }

        matchGroups[key].push(m);
      });

      const sortedDates = Object.keys(matchGroups).sort((a, b) => {
        if (a === "TBC") return 1;
        if (b === "TBC") return -1;
        return a.localeCompare(b);
      });

      $("matches").innerHTML = sortedDates.length
        ? sortedDates.map(date => {
            const dayMatches = matchGroups[date];

            return `
              <section class="fixture-day panel">
                <div class="fixture-day-heading">
                  <h3>${BANTY.esc(dateHeading(date))}</h3>
                  <span class="fixture-day-count">
                    ${dayMatches.length}
                    ${dayMatches.length === 1 ? "MATCH" : "MATCHES"}
                  </span>
                </div>

                <div class="fixture-list">
                  ${dayMatches.map(m => {
                    const home = tm[m.home_team_id] || "TBD";
                    const away = tm[m.away_team_id] || "TBD";

                    const played =
                      m.status === "played" &&
                      m.home_score != null &&
                      m.away_score != null;

                    return `
                      <article class="fixture-row">
                        <div class="fixture-time">
                          ${kickoff(m.kickoff)}
                        </div>

                        <div class="fixture-teams">
                          <div>${teamLink(m.home_team_id, home)}</div>
                          <span class="fixture-vs">VS</span>
                          <div>${teamLink(m.away_team_id, away)}</div>
                        </div>

                        <div class="fixture-result">
                          ${
                            played
                              ? `<strong>${BANTY.esc(m.home_score)} – ${BANTY.esc(m.away_score)}</strong>`
                              : `<span class="fixture-pending">VS</span>`
                          }
                        </div>

                        <div class="fixture-details">
                          <span>${BANTY.esc(m.venue || "Venue TBC")}</span>
                          <span class="fixture-status ${played ? "is-played" : ""}">
                            ${BANTY.esc(m.status || "scheduled")}
                          </span>
                        </div>
                      </article>
                    `;
                  }).join("")}
                </div>
              </section>
            `;
          }).join("")
        : empty("No fixtures have been published yet.");

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
    }

    loadTournament().catch(e => {
      ["league", "scorers", "cards", "matches", "teams"].forEach(id => {
        $(id).innerHTML = empty(
          e.message || "Site setup is not complete."
        );
      });

      console.error(e);
    });

  } catch (e) {
    console.error(e);
  }
})();
