(function () {
  const $ = id => document.getElementById(id);
  const notice = $("notice");
  const area = $("adminArea");
  const login = $("login");
  const logout = $("logout");

  let client;
  let teams = [];
  let players = [];
  let matches = [];
  let drawAssignments = [];
  let drawPublished = false;
  let motmAwards = [];

  const linkStoreKey = "bantyMooreRegistrationLinks";
  const groups = ["A", "B", "C", "D", "E", "F"];

  function savedLinks() {
    try {
      return JSON.parse(localStorage.getItem(linkStoreKey) || "[]");
    } catch {
      return [];
    }
  }

  function saveLink(item) {
    const all = savedLinks().filter(
      x => String(x.team_id) !== String(item.team_id)
    );
    all.push(item);
    localStorage.setItem(linkStoreKey, JSON.stringify(all));
  }

  function msg(message, bad = false) {
    notice.hidden = false;
    BANTY.message(notice, message, bad);
  }

  function opts(element, rows, label) {
    if (!element) return;

    element.innerHTML =
      '<option value="">Select an option</option>' +
      rows.map(row =>
        `<option value="${BANTY.esc(row.id)}">${BANTY.esc(label(row))}</option>`
      ).join("");
  }

  function teamName(teamId) {
    return teams.find(team =>
      String(team.id) === String(teamId)
    )?.name || "Unknown team";
  }

  function matchLabel(match) {
    return `${teamName(match.home_team_id)} vs ${teamName(match.away_team_id)}`;
  }

  function playerName(playerId) {
    return players.find(player =>
      String(player.id) === String(playerId)
    )?.full_name || "Unknown player";
  }

  async function requireAdmin() {
    client = await BANTY.ready();

    const result = await BANTY.adminCheck(client);

    if (!result.user) {
      area.hidden = true;
      logout.hidden = true;
      login.hidden = false;
      return false;
    }

    if (!result.admin) {
      await client.auth.signOut();
      msg("This account is not listed as an authorized tournament admin.", true);
      return false;
    }

    login.hidden = true;
    logout.hidden = false;
    area.hidden = false;

    await refresh();
    return true;
  }

  async function refresh() {
    const [
      teamResult,
      playerResult,
      matchResult,
      motmResult
    ] = await Promise.all([
      client.from("teams").select("*").order("name"),
      client.from("players").select("*").order("created_at", { ascending: true }),
      client.from("matches").select("*").order("kickoff"),
      client.from("match_man_of_the_match").select("match_id,player_id,created_at")
    ]);

    if (
      teamResult.error ||
      playerResult.error ||
      matchResult.error ||
      motmResult.error
    ) {
      throw new Error(
        teamResult.error?.message ||
        playerResult.error?.message ||
        matchResult.error?.message ||
        motmResult.error?.message
      );
    }

    teams = teamResult.data || [];
    players = playerResult.data || [];
    matches = matchResult.data || [];
    motmAwards = motmResult.data || [];

    opts($("homeTeam"), teams, team => team.name);
    opts($("awayTeam"), teams, team => team.name);

    opts($("resultMatch"), matches, matchLabel);
    opts($("eventMatch"), matches, matchLabel);
    opts($("motmMatch"), matches, matchLabel);

    opts(
      $("eventPlayer"),
      players.filter(player => player.registration_status === "approved"),
      player =>
        `${player.full_name} — ${teamName(player.team_id)}`
    );

    await renderTeamLinks();
    renderPendingPlayers();
    await refreshDraw();
    updateMotmPlayers();
    renderMotmAwards();
  }

  // TEAM LINKS

  async function renderTeamLinks() {
    const { data, error } = await client
      .from("team_registration_tokens")
      .select("team_id, token_value, active")
      .eq("active", true);

    if (error) throw error;

    const tokenRows = data || [];

    $("teamLinks").innerHTML = teams.map(team => {
      const item = tokenRows.find(
        row =>
          String(row.team_id) === String(team.id) &&
          row.token_value
      );

      const url = item
        ? `${location.origin}${location.pathname.replace(
            "admin.html",
            "registration.html"
          )}?token=${encodeURIComponent(item.token_value)}`
        : "";

      return `
        <div class="panel">
          <b>${BANTY.esc(team.name)}</b>
          ${
            url
              ? `<p>
                  <input readonly value="${BANTY.esc(url)}"
                    aria-label="Private registration link for ${BANTY.esc(team.name)}">
                  <button class="button" type="button"
                    data-copy-link="${BANTY.esc(team.id)}">Copy link</button>
                </p>`
              : `<p class="muted">No active manager link found.</p>`
          }
          <button class="button danger" type="button"
            data-delete-team="${BANTY.esc(team.id)}"
            data-team-name="${BANTY.esc(team.name)}">Delete Team</button>
        </div>
      `;
    }).join("") || '<p class="muted">No teams yet.</p>';

    $("teamLinks").querySelectorAll("[data-copy-link]").forEach(button => {
      button.onclick = async () => {
        const item = tokenRows.find(
          row =>
            String(row.team_id) === button.dataset.copyLink &&
            row.token_value
        );

        if (!item) return;

        const url = `${location.origin}${location.pathname.replace(
          "admin.html",
          "registration.html"
        )}?token=${encodeURIComponent(item.token_value)}`;

        try {
          await navigator.clipboard.writeText(url);
          msg("Manager link copied. Send it only to the correct team manager.");
        } catch {
          const input = button.parentElement.querySelector("input");
          if (input) {
            input.focus();
            input.select();
            msg("Link selected. Press Ctrl+C to copy it.");
          }
        }
      };
    });

    $("teamLinks").querySelectorAll("[data-delete-team]").forEach(button => {
      button.onclick = () =>
        deleteTeam(button.dataset.deleteTeam, button.dataset.teamName);
    });
  }

  // PLAYER APPROVALS

  function renderPendingPlayers() {
    const pending = players.filter(
      player => player.registration_status === "pending"
    );

    $("pending").innerHTML = pending.map(player => `
      <div class="panel">
        <b>${BANTY.esc(player.full_name)}</b> —
        ${BANTY.esc(teamName(player.team_id))}
        ${player.jersey_number == null ? "" : `(#${player.jersey_number})`}
        <div class="row-actions">
          <button class="button" data-approve="${player.id}">Approve</button>
          <button class="button danger" data-reject="${player.id}">Reject</button>
        </div>
      </div>
    `).join("") || '<p class="muted">No pending registrations.</p>';

    $("pending").querySelectorAll("[data-approve]").forEach(button => {
      button.onclick = () => setStatus(button.dataset.approve, "approved");
    });

    $("pending").querySelectorAll("[data-reject]").forEach(button => {
      button.onclick = () => setStatus(button.dataset.reject, "rejected");
    });
  }

  async function setStatus(id, status) {
    const { error } = await client
      .from("players")
      .update({ registration_status: status })
      .eq("id", id);

    if (error) {
      msg(error.message, true);
    } else {
      msg("Player status updated.");
      await refresh();
    }
  }

  // GROUP DRAW MANAGER

  function createClearDrawButton() {
    if ($("clearDraw")) return;

    const button = document.createElement("button");
    button.id = "clearDraw";
    button.type = "button";
    button.className = "button danger";
    button.textContent = "Clear All Groups";
    button.style.marginTop = "12px";

    button.addEventListener("click", clearAllGroups);

    const progress = $("drawProgress");
    const groupContainer = $("drawGroups");
    const manager = $("drawManager");

    if (progress && progress.parentElement) {
      progress.insertAdjacentElement("afterend", button);
    } else if (groupContainer) {
      groupContainer.insertAdjacentElement("beforebegin", button);
    } else if (manager) {
      manager.appendChild(button);
    }
  }

  async function refreshDraw() {
    const drawTeam = $("drawTeam");
    const drawGroups = $("drawGroups");

    if (!drawTeam || !drawGroups) return;

    const [assignmentResult, settingsResult] = await Promise.all([
      client
        .from("tournament_group_assignments")
        .select("team_id, group_name"),

      client
        .from("tournament_draw_settings")
        .select("is_published")
        .eq("id", true)
        .maybeSingle()
    ]);

    if (assignmentResult.error) throw assignmentResult.error;
    if (settingsResult.error) throw settingsResult.error;

    drawAssignments = assignmentResult.data || [];
    drawPublished = settingsResult.data?.is_published === true;

    drawTeam.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = teams.length
      ? "Choose a team"
      : "No teams found — create teams first";

    drawTeam.appendChild(placeholder);

    teams.forEach(team => {
      const option = document.createElement("option");
      option.value = String(team.id);
      option.textContent = team.name;
      drawTeam.appendChild(option);
    });

    createClearDrawButton();
    renderDrawGroups();
    updateDrawProgress();
  }

  function renderDrawGroups() {
    const container = $("drawGroups");
    if (!container) return;

    container.innerHTML = groups.map(group => {
      const assigned = drawAssignments.filter(
        assignment => assignment.group_name === group
      );

      const teamNames = assigned.map(assignment => {
        const team = teams.find(
          item => String(item.id) === String(assignment.team_id)
        );

        return team
          ? `<li>${BANTY.esc(team.name)}</li>`
          : "<li>Unknown team</li>";
      }).join("");

      const emptySlots = Array.from(
        { length: Math.max(0, 4 - assigned.length) },
        () => "<li class=\"muted\">Waiting for team...</li>"
      ).join("");

      return `
        <div class="panel">
          <h3>Group ${group}</h3>
          <p>${assigned.length} of 4 teams</p>
          <ol>${teamNames}${emptySlots}</ol>
        </div>
      `;
    }).join("");
  }

  function updateDrawProgress() {
    const total = drawAssignments.length;

    const complete = groups.every(group =>
      drawAssignments.filter(item => item.group_name === group).length === 4
    );

    const progress = $("drawProgress");
    const publishButton = $("publishDraw");
    const unpublishButton = $("unpublishDraw");
    const clearButton = $("clearDraw");

    if (progress) {
      progress.textContent =
        `${total} of 24 teams assigned. ` +
        `${drawPublished ? "The draw is published." : "The draw is not published yet."}`;
    }

    if (publishButton) {
      publishButton.disabled = !(
        teams.length === 24 &&
        total === 24 &&
        complete
      );
    }

    if (unpublishButton) {
      unpublishButton.hidden = !drawPublished;
    }

    if (clearButton) {
      clearButton.disabled = total === 0;
    }
  }

  async function saveDrawAssignment(event) {
    event.preventDefault();

    try {
      const teamId = $("drawTeam").value;
      const groupName = $("drawGroup").value;

      if (!teamId || !groupName) {
        throw new Error("Choose a team and a group.");
      }

      const alreadyAssigned = drawAssignments.find(
        item => String(item.team_id) === String(teamId)
      );

      if (alreadyAssigned) {
        throw new Error("This team has already been assigned to a group.");
      }

      const groupCount = drawAssignments.filter(
        item => item.group_name === groupName
      ).length;

      if (groupCount >= 4) {
        throw new Error(`Group ${groupName} already has four teams.`);
      }

      if (drawPublished) {
        const { error: unpublishError } = await client
          .from("tournament_draw_settings")
          .update({
            is_published: false,
            updated_at: new Date().toISOString()
          })
          .eq("id", true);

        if (unpublishError) throw unpublishError;
      }

      const { error } = await client
        .from("tournament_group_assignments")
        .upsert(
          {
            team_id: Number(teamId),
            group_name: groupName
          },
          { onConflict: "team_id" }
        );

      if (error) throw error;

      $("drawTeam").value = "";
      msg("Team successfully added to Group " + groupName + ".");
      await refreshDraw();
    } catch (error) {
      msg(error.message || "Could not save the team assignment.", true);
    }
  }

  async function clearAllGroups() {
    if (drawAssignments.length === 0) {
      msg("There are no group assignments to clear.", true);
      return;
    }

    const confirmed = confirm(
      "Are you sure you want to clear ALL groups?\n\n" +
      "This will remove every team's group assignment and unpublish the draw.\n\n" +
      "Your teams, players, manager links, fixtures, goals and cards will NOT be deleted."
    );

    if (!confirmed) return;

    const button = $("clearDraw");
    if (button) {
      button.disabled = true;
      button.textContent = "Clearing groups...";
    }

    try {
      const { error: settingsError } = await client
        .from("tournament_draw_settings")
        .update({
          is_published: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", true);

      if (settingsError) throw settingsError;

      const { error: deleteError } = await client
        .from("tournament_group_assignments")
        .delete()
        .not("team_id", "is", null);

      if (deleteError) throw deleteError;

      msg("All groups have been cleared. You can now pick the teams again.");
      await refreshDraw();
    } catch (error) {
      msg(error.message || "Could not clear the groups.", true);

      if (button) {
        button.disabled = false;
        button.textContent = "Clear All Groups";
      }
    }
  }

  async function publishDraw() {
    try {
      if (teams.length !== 24 || drawAssignments.length !== 24) {
        throw new Error("You need exactly 24 teams assigned before publishing.");
      }

      for (const group of groups) {
        const count = drawAssignments.filter(
          item => item.group_name === group
        ).length;

        if (count !== 4) {
          throw new Error(`Group ${group} must contain exactly four teams.`);
        }
      }

      const confirmed = confirm(
        "Publish the group draw? The groups will become visible on the public website."
      );

      if (!confirmed) return;

      const { error } = await client
        .from("tournament_draw_settings")
        .update({
          is_published: true,
          updated_at: new Date().toISOString()
        })
        .eq("id", true);

      if (error) throw error;

      msg("The group draw has been published.");
      await refreshDraw();
    } catch (error) {
      msg(error.message || "Could not publish the draw.", true);
    }
  }

  async function unpublishDraw() {
    const confirmed = confirm(
      "Unpublish the group draw? It will no longer be visible to the public."
    );

    if (!confirmed) return;

    try {
      const { error } = await client
        .from("tournament_draw_settings")
        .update({
          is_published: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", true);

      if (error) throw error;

      msg("The group draw has been unpublished.");
      await refreshDraw();
    } catch (error) {
      msg(error.message || "Could not unpublish the draw.", true);
    }
  }

  // MAN OF THE MATCH

  function updateMotmPlayers() {
    const matchSelect = $("motmMatch");
    const playerSelect = $("motmPlayer");
    const saveButton = $("saveMotm");
    const currentBox = $("motmCurrent");

    if (!matchSelect || !playerSelect || !saveButton) return;

    const matchId = matchSelect.value;
    const match = matches.find(
      item => String(item.id) === String(matchId)
    );

    playerSelect.innerHTML = "";
    saveButton.disabled = true;

    if (!match) {
      playerSelect.innerHTML =
        '<option value="">Select a fixture first</option>';
      playerSelect.disabled = true;

      if (currentBox) currentBox.hidden = true;
      return;
    }

    const participatingTeamIds = [
      String(match.home_team_id),
      String(match.away_team_id)
    ];

    const eligiblePlayers = players.filter(player =>
      player.registration_status === "approved" &&
      participatingTeamIds.includes(String(player.team_id))
    );

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = eligiblePlayers.length
      ? "Choose the Man of the Match"
      : "No approved players registered for these teams";

    playerSelect.appendChild(placeholder);

    eligiblePlayers.forEach(player => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent =
        `${player.full_name} — ${teamName(player.team_id)}`;
      playerSelect.appendChild(option);
    });

    playerSelect.disabled = eligiblePlayers.length === 0;
    saveButton.disabled = eligiblePlayers.length === 0;

    const existingAward = motmAwards.find(
      award => String(award.match_id) === String(match.id)
    );

    if (existingAward) {
      const awardedPlayer = players.find(
        player => String(player.id) === String(existingAward.player_id)
      );

      if (currentBox) {
        currentBox.hidden = false;
        currentBox.textContent = awardedPlayer
          ? `Current Man of the Match: ${awardedPlayer.full_name} (${teamName(awardedPlayer.team_id)}). You can select another player to replace this award.`
          : "An award is already saved for this fixture. The player may no longer be available.";
      }

      if (
        awardedPlayer &&
        awardedPlayer.registration_status === "approved" &&
        participatingTeamIds.includes(String(awardedPlayer.team_id))
      ) {
        playerSelect.value = String(awardedPlayer.id);
      }
    } else if (currentBox) {
      currentBox.hidden = true;
    }
  }

  async function saveManOfTheMatch(event) {
    event.preventDefault();

    try {
      const matchId = $("motmMatch").value;
      const playerId = $("motmPlayer").value;

      if (!matchId || !playerId) {
        throw new Error("Select a fixture and a Man of the Match player.");
      }

      const match = matches.find(
        item => String(item.id) === String(matchId)
      );

      const player = players.find(
        item => String(item.id) === String(playerId)
      );

      if (!match || !player) {
        throw new Error("The selected fixture or player could not be found.");
      }

      const belongsToMatch =
        String(player.team_id) === String(match.home_team_id) ||
        String(player.team_id) === String(match.away_team_id);

      if (
        player.registration_status !== "approved" ||
        !belongsToMatch
      ) {
        throw new Error(
          "Choose an approved player from one of the two teams in this fixture."
        );
      }

      const button = $("saveMotm");
      button.disabled = true;
      button.textContent = "Saving award...";

      const { error } = await client
        .from("match_man_of_the_match")
        .upsert(
          {
            match_id: Number(matchId),
            player_id: playerId
          },
          { onConflict: "match_id" }
        );

      if (error) throw error;

      msg(`Man of the Match saved for ${matchLabel(match)}.`);
      await refresh();
    } catch (error) {
      msg(error.message || "Could not save the Man of the Match award.", true);
    } finally {
      const button = $("saveMotm");
      if (button) {
        button.textContent = "Save Man of the Match";
        updateMotmPlayers();
      }
    }
  }

  function renderMotmAwards() {
    const container = $("motmAwards");
    if (!container) return;

    if (!motmAwards.length) {
      container.innerHTML =
        '<p class="muted">No Man of the Match awards have been recorded yet.</p>';
      return;
    }

    const sortedAwards = [...motmAwards].sort((a, b) => {
      const aMatch = matches.find(
        match => String(match.id) === String(a.match_id)
      );
      const bMatch = matches.find(
        match => String(match.id) === String(b.match_id)
      );

      return new Date(bMatch?.kickoff || 0) -
        new Date(aMatch?.kickoff || 0);
    });

    container.innerHTML = `
      <h3>Recorded Man of the Match Awards</h3>
      ${sortedAwards.map(award => {
        const match = matches.find(
          item => String(item.id) === String(award.match_id)
        );

        const player = players.find(
          item => String(item.id) === String(award.player_id)
        );

        return `
          <div class="panel">
            <b>${BANTY.esc(match ? matchLabel(match) : "Unknown fixture")}</b>
            <p>
              ${BANTY.esc(player?.full_name || "Unknown player")}
              — ${BANTY.esc(player ? teamName(player.team_id) : "")}
            </p>
          </div>
        `;
      }).join("")}
    `;
  }

  // TEAM DELETION

  function confirmDeleteTeam(teamNameValue) {
    return new Promise(resolve => {
      const dialog = document.createElement("dialog");

      dialog.setAttribute("aria-labelledby", "deleteTeamTitle");
      dialog.style.cssText =
        "max-width:420px;width:calc(100% - 40px);border:1px solid #ccc;border-radius:12px;padding:24px;color:#222";

      dialog.innerHTML = `
        <h2 id="deleteTeamTitle">Delete Team?</h2>
        <p>Are you sure you want to delete <strong></strong>?</p>
        <p>This action cannot be undone. The team's players and related personal match events will be deleted. Teams with fixtures cannot be deleted.</p>
        <div style="display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap">
          <button type="button" data-cancel-delete>Cancel</button>
          <button type="button" data-confirm-delete style="background:#b42318;color:white;border:0;border-radius:6px;padding:10px 14px">Yes, Delete Team</button>
        </div>
      `;

      dialog.querySelector("strong").textContent = teamNameValue;

      const finish = value => {
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(value);
      };

      dialog.querySelector("[data-cancel-delete]").onclick = () => finish(false);
      dialog.querySelector("[data-confirm-delete]").onclick = () => finish(true);

      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        finish(false);
      }, { once: true });

      dialog.addEventListener("click", event => {
        if (event.target === dialog) finish(false);
      });

      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  async function deleteTeam(teamId, teamNameValue) {
    const confirmed = await confirmDeleteTeam(teamNameValue);
    if (!confirmed) return;

    const button = $("teamLinks").querySelector(
      `[data-delete-team="${CSS.escape(String(teamId))}"]`
    );

    if (button) button.disabled = true;

    try {
      const { data, error } = await client.rpc(
        "delete_team_safe",
        { p_team_id: Number(teamId) }
      );

      if (error) throw error;

      localStorage.setItem(
        linkStoreKey,
        JSON.stringify(
          savedLinks().filter(item => String(item.team_id) !== String(teamId))
        )
      );

      msg(`Team "${typeof data === "string" ? data : teamNameValue}" was deleted successfully.`);
      await refresh();
    } catch (error) {
      msg(error.message || "Could not delete this team.", true);
      if (button) button.disabled = false;
    }
  }

  // LOGIN

  login.addEventListener("submit", async event => {
    event.preventDefault();

    try {
      client = await BANTY.ready();

      const { error } = await client.auth.signInWithPassword({
        email: $("email").value,
        password: $("password").value
      });

      if (error) throw error;

      await requireAdmin();
    } catch (error) {
      msg(error.message || "Sign in failed.", true);
    }
  });

  logout.addEventListener("click", async () => {
    await client.auth.signOut();

    area.hidden = true;
    login.hidden = false;
    logout.hidden = true;

    msg("Signed out.");
  });

  // CREATE TEAM

  $("teamForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const name = $("teamName").value.trim();

      if (!name) throw new Error("Enter a team name.");

      const token = crypto.randomUUID().replaceAll("-", "");

      const { data, error } = await client
        .from("teams")
        .insert({ name })
        .select("id,name")
        .single();

      if (error) throw error;

      const { error: tokenError } = await client
        .from("team_registration_tokens")
        .insert({
          team_id: data.id,
          token_hash: await sha256(token),
          token_value: token,
          active: true
        });

      if (tokenError) throw tokenError;

      const url = `${location.origin}${location.pathname.replace(
        "admin.html",
        "registration.html"
      )}?token=${encodeURIComponent(token)}`;

      saveLink({ team_id: data.id, name, url });

      msg(
        "Team created. Copy the private link shown below and send it only to that manager."
      );

      $("teamName").value = "";
      await refresh();
    } catch (error) {
      msg(error.message || "Could not create team.", true);
    }
  });

  async function sha256(value) {
    const bytes = new TextEncoder().encode(value);
    const hash = await crypto.subtle.digest("SHA-256", bytes);

    return [...new Uint8Array(hash)]
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  // CREATE FIXTURE

  $("matchForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const home = Number($("homeTeam").value);
      const away = Number($("awayTeam").value);

      if (!home || !away || home === away) {
        throw new Error("Choose two different teams.");
      }

      const when = $("kickoff").value;

      const { error } = await client
        .from("matches")
        .insert({
          home_team_id: home,
          away_team_id: away,
          kickoff: when ? new Date(when).toISOString() : null,
          venue: $("venue").value.trim() || null
        });

      if (error) throw error;

      msg("Fixture created.");
      await refresh();
    } catch (error) {
      msg(error.message, true);
    }
  });

  // RECORD RESULT

  $("resultForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const { error } = await client
        .from("matches")
        .update({
          home_score: Number($("homeScore").value),
          away_score: Number($("awayScore").value),
          status: "played"
        })
        .eq("id", Number($("resultMatch").value));

      if (error) throw error;

      msg("Result saved.");
      await refresh();
    } catch (error) {
      msg(error.message, true);
    }
  });

  // RECORD GOALS AND CARDS

  $("eventForm").addEventListener("submit", async event => {
    event.preventDefault();

    try {
      const type = $("eventType").value;

      const base = {
        match_id: Number($("eventMatch").value),
        player_id: $("eventPlayer").value
      };

      let result;

      if (type === "goal") {
        result = await client
          .from("goals")
          .insert({
            ...base,
            goal_time: $("eventMinute").value.trim() || null
          });
      } else {
        result = await client
          .from("cards")
          .insert({
            ...base,
            card_type: type,
            card_time: $("eventMinute").value.trim() || null
          });
      }

      if (result.error) throw result.error;

      msg("Match event recorded.");
      $("eventMinute").value = "";
    } catch (error) {
      msg(error.message, true);
    }
  });

  // MAN OF THE MATCH FORM EVENTS

  if ($("motmMatch")) {
    $("motmMatch").addEventListener("change", updateMotmPlayers);
  }

  if ($("motmForm")) {
    $("motmForm").addEventListener("submit", saveManOfTheMatch);
  }

  // GROUP DRAW BUTTONS

  if ($("drawForm")) {
    $("drawForm").addEventListener("submit", saveDrawAssignment);
  }

  if ($("publishDraw")) {
    $("publishDraw").addEventListener("click", publishDraw);
  }

  if ($("unpublishDraw")) {
    $("unpublishDraw").addEventListener("click", unpublishDraw);
  }

  requireAdmin().catch(error => msg(error.message, true));
})();
