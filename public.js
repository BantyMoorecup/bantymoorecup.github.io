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

  const playerLink = (id, name) =>
    `<a class="player-profile-link"
        href="player.html?id=${encodeURIComponent(id)}">
        ${BANTY.esc(name)}
     </a>`;

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

  // Convert match minutes such as 45+2 into sortable numbers.
  function minuteValue(value) {
    if (value == null || String(value).trim() === "") {
      return Infinity;
    }

    const text = String(value).trim();
    const parts = text.match(/^(\d+)(?:\+(\d+))?/);

    if (!parts) return Infinity;

    return Number(parts[1]) + Number(parts[2] || 0) / 100;
  }

  function displayMinute(value) {
    if (value == null || String(value).trim() === "") {
      return "Time not recorded";
    }

    return `${BANTY.esc(value)}'`;
  }

  function renderMatchDetails(match, teams, players, goals, cards, awards) {
    const home = teams[match.home_team_id] || "TBD";
    const away = teams[match.away_team_id] || "TBD";

    const homeScore = match.home_score ?? "-";
    const awayScore = match.away_score ?? "-";

    const matchGoals = goals
      .filter(event => String(event.match_id) === String(match.id))
      .map(event => ({
        type: "goal",
        player_id: event.player_id,
        minute: event.goal_time
      }));

    const matchCards = cards
      .filter(event => String(event.match_id) === String(match.id))
      .map(event => ({
        type: event.card_type,
        player_id: event.player_id,
        minute: event.card_time
      }));

    // Combine goals and cards into one chronological timeline.
    const events = [...matchGoals, ...matchCards].sort(
      (a, b) => minuteValue(a.minute) - minuteValue(b.minute)
    );

    const award = awards.find(
      item => String(item.match_id) === String(match.id)
    );

    const motm = award
      ? players[award.player_id]
      : null;

    const timeline = events.length
      ? events.map(event => {
          const player = players[event.player_id];
          const playerName = player?.full_name || "Unknown player";
          const playerTeam = player
            ? teams[player.team_id] || "Unknown team"
            : "Unknown team";

          let icon = "⚽";
          let label = "GOAL";
          let color = "#45c477";

          if (event.type === "yellow") {
            icon = "🟨";
            label = "YELLOW CARD";
            color = "#e9b84c";
          } else if (event.type === "red") {
            icon = "🟥";
            label = "RED CARD";
            color = "#ed6464";
          }

          return `
            <div class="match-event">
              <strong class="match-event-minute">
                ${displayMinute(event.minute)}
              </strong>

              <span class="match-event-icon">${icon}</span>

              <div class="match-event-player">
                <strong>${BANTY.esc(playerName)}</strong>
                <small>${BANTY.esc(label)} · ${BANTY.esc(playerTeam)}</small>
              </div>

              <span style="color:${color};font-weight:800">
                ${BANTY.esc(label)}
              </span>
            </div>
          `;
        }).join("")
      : empty("No goals or cards have been recorded for this match yet.");

    return `
      <div class="match-detail-card">

        <div class="match-detail-score">
          <div>
            <strong>${BANTY.esc(home)}</strong>
          </div>

          <div class="match-detail-numbers">
            ${BANTY.esc(homeScore)}
            -
            ${BANTY.esc(awayScore)}
          </div>

          <div>
            <strong>${BANTY.esc(away)}</strong>
          </div>
        </div>

        <p class="muted">
          ${kickoff(match.kickoff)}
          ·
          ${BANTY.esc(match.venue || "Venue TBC")}
        </p>

        <h3>MATCH TIMELINE</h3>

        <div class="match-timeline">
          ${timeline}
        </div>

        <div class="match-motm">
          <h3>⭐ MAN OF THE MATCH</h3>

          ${
            motm
              ? `
                <strong>${playerLink(motm.id, motm.full_name)}</strong>
                <p class="muted">
                  ${BANTY.esc(teams[motm.team_id] || "Unknown team")}
                </p>
              `
              : empty("Man of the Match has not been announced yet.")
          }
        </div>

      </div>
    `;
  }

  // Add match-details styling without changing styles.css.
  function addMatchStyles() {
    if ($("match-details-styles")) return;

    const style = document.createElement("style");
    style.id = "match-details-styles";

    style.textContent = `
      .fixture-row {
        cursor: default;
      }

      .fixture-details-button {
        display: block;
        width: 100%;
        margin-top: 12px;
        padding: 11px;
        border: 0;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 800;
      }

      .match-detail-card {
        background: #101b18;
        border: 1px solid rgba(233,184,76,.3);
        border-radius: 12px;
        padding: 16px;
        margin-top: 12px;
      }

      .match-detail-score {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 12px;
        text-align: center;
      }

      .match-detail-score > div:first-child {
        text-align: left;
      }

      .match-detail-score > div:last-child {
        text-align: right;
      }

      .match-detail-numbers {
        font-size: 1.8rem;
        font-weight: 900;
        color: #e9b84c;
        white-space: nowrap;
      }

      .match-timeline {
        margin-top: 12px;
      }

      .match-event {
        display: grid;
        grid-template-columns: 48px 30px 1fr;
        gap: 10px;
        align-items: center;
        padding: 13px 0;
        border-bottom: 1px solid rgba(255,255,255,.1);
      }

      .match-event-minute {
        color: #e9b84c;
        white-space: nowrap;
      }

      .match-event-icon {
        font-size: 1.25rem;
      }

      .match-event-player {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .match-event-player small {
        color: #b8c9bd;
      }

      .match-event > span:last-child {
        grid-column: 3;
        font-size: .7rem;
      }

      .match-motm {
        margin-top: 20px;
        padding-top: 12px;
        border-top: 1px solid rgba(255,255,255,.12);
      }
    `;

    document.head.appendChild(style);
  }

  async function loadTournament() {
    try {
      const c = await BANTY.ready();

      const [
        { data: teams, error: te },
        { data: players, error: pe },
        { data: matches, error: me },
        { data: goals, error: ge },
        { data: cards, error: ce },
        { data: assignments, error: ae },
        { data: drawSettings, error: de },
        { data: awards, error: awe }
      ] = await Promise.all([
        c.from("teams").select("id,name").order("name"),

        c.from("players")
          .select("id,team_id,full_name,jersey_number")
          .eq("registration_status", "approved"),

        c.from("matches")
          .select("id,home_team_id,away_team_id,kickoff,venue,home_score,away_score,status")
          .order("kickoff"),

        c.from("goals")
          .select("id,player_id,match_id,goal_time"),

        c.from("cards")
          .select("id,player_id,match_id,card_type,card_time"),

        c.from("tournament_group_assignments")
          .select("team_id,group_name"),

        c.from("tournament_draw_settings")
          .select("is_published")
          .eq("id", true)
          .maybeSingle(),

        c.from("match_man_of_the_match")
          .select("match_id,player_id")
      ]);

      if (te || pe || me || ge || ce || ae || de || awe) {
        throw new Error(
          te?.message || pe?.message || me?.message ||
          ge?.message || ce?.message || ae?.message ||
          de?.message || awe?.message ||
          "Could not load tournament data."
        );
      }

      const tm = Object.fromEntries(
        (teams || []).map(t => [t.id, t.name])
      );

      const pl = Object.fromEntries(
        (players || []).map(p => [p.id, p])
      );

      // GROUP TABLES

      const standings = {};

      (teams || []).forEach(t => {
        standings[t.id] = {
          id: t.id,
          name: t.name,
          p: 0, w: 0, d: 0, l: 0,
          gf: 0, ga: 0, pts: 0
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

      // GROUP ASSIGNMENTS

      const drawPublished = drawSettings?.is_published === true;

      const teamGroup = Object.fromEntries(
        (assignments || []).map(item => [
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
          }).join("");
      }

      // TOP SCORERS

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
              <td>${playerLink(id, pl[id].full_name)}</td>
              <td>${teamLink(
                pl[id].team_id,
                tm[pl[id].team_id] || "Unknown team"
              )}</td>
              <td>${n}</td>
            </tr>
          `)
      );

      // CARD STATISTICS

      const cc = {};

      (cards || []).forEach(card => {
        if (!pl[card.player_id]) return;

        const id = card.player_id;
        cc[id] ??= { y: 0, r: 0 };

        if (card.card_type === "yellow") cc[id].y++;
        if (card.card_type === "red") cc[id].r++;
      });

      $("cards").innerHTML = table(
        ["Player", "Team", "Yellow", "Red"],
        Object.entries(cc)
          .sort((a, b) =>
            b[1].r - a[1].r || b[1].y - a[1].y
          )
          .map(([id, v]) => `
            <tr>
              <td>${playerLink(id, pl[id].full_name)}</td>
              <td>${teamLink(
                pl[id].team_id,
                tm[pl[id].team_id] || "Unknown team"
              )}</td>
              <td>${v.y}</td>
              <td>${v.r}</td>
            </tr>
          `)
      );

      // CLICKABLE FIXTURES

      addMatchStyles();

      const matchGroups = {};

      (matches || []).forEach(m => {
        const key = dateKey(m.kickoff);
        if (!matchGroups[key]) matchGroups[key] = [];
        matchGroups[key].push(m);
      });

      const sortedDates = Object.keys(matchGroups).sort((a, b) => {
        if (a === "TBC") return 1;
        if (b === "TBC") return -1;
        return a.localeCompare(b);
      });

      $("matches").innerHTML = sortedDates.length
        ? sortedDates.map(date => `
            <section class="fixture-day">

              <div class="fixture-day-heading">
                <h3>${BANTY.esc(dateHeading(date))}</h3>
                <span>
                  ${matchGroups[date].length}
                  ${matchGroups[date].length === 1 ? "MATCH" : "MATCHES"}
                </span>
              </div>

              <div class="fixture-list">

                ${matchGroups[date].map(m => {
                  const home = tm[m.home_team_id] || "TBD";
                  const away = tm[m.away_team_id] || "TBD";

                  const played =
                    m.status === "played" &&
                    m.home_score != null &&
                    m.away_score != null;

                  return `
                    <article class="fixture-row">

                      <div class="fixture-main">

                        <span class="fixture-status ${played ? "is-played" : ""}">
                          ${played ? "FT" : "UPCOMING"}
                        </span>

                        <div class="fixture-team">
                          ${teamLink(m.home_team_id, home)}
                        </div>

                        <strong class="fixture-score">
                          ${
                            played
                              ? `${BANTY.esc(m.home_score)} – ${BANTY.esc(m.away_score)}`
                              : "VS"
                          }
                        </strong>

                        <div class="fixture-team">
                          ${teamLink(m.away_team_id, away)}
                        </div>

                      </div>

                      <div class="fixture-meta">
                        <span>${kickoff(m.kickoff)}</span>
                        <span>${BANTY.esc(m.venue || "Venue TBC")}</span>
                      </div>

                      <button
                        type="button"
                        class="fixture-details-button"
                        data-view-match="${BANTY.esc(m.id)}">
                        VIEW MATCH DETAILS
                      </button>

                      <div id="match-details-${BANTY.esc(m.id)}" hidden></div>

                    </article>
                  `;
                }).join("")}

              </div>
            </section>
          `).join("")
        : empty("No fixtures have been published yet.");

      // Open and close match details.
      $("matches").querySelectorAll("[data-view-match]").forEach(button => {
        button.addEventListener("click", () => {
          const matchId = button.dataset.viewMatch;
          const container = $(`match-details-${matchId}`);

          if (!container) return;

          if (!container.hidden) {
            container.hidden = true;
            button.textContent = "VIEW MATCH DETAILS";
            return;
          }

          const match = (matches || []).find(
            item => String(item.id) === String(matchId)
          );

          if (!match) return;

          container.innerHTML = renderMatchDetails(
            match, tm, pl, goals || [], cards || [], awards || []
          );

          container.hidden = false;
          button.textContent = "HIDE MATCH DETAILS";
        });
      });

      // TEAMS AND APPROVED PLAYERS

      $("teams").innerHTML =
        (teams || []).map(t => `
          <div class="panel">
            <h3>${teamLink(t.id, t.name)}</h3>

            <ul>
              ${(players || [])
                .filter(p => String(p.team_id) === String(t.id))
                .map(p => `
                  <li>
                    ${playerLink(p.id, p.full_name)}
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
  }

  loadTournament();
})();
