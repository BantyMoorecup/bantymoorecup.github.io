
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
    const [teamResult, playerResult, matchResult] = await Promise.all([
      client.from("teams").select("*").order("name"),
      client.from("players").select("*").order("created_at", { ascending: true }),
      client.from("matches").select("*").order("kickoff")
    ]);

    if (teamResult.error || playerResult.error || matchResult.error) {
      throw new Error(
        teamResult.error?.message ||
        playerResult.error?.message ||
        matchResult.error?.message
      );
    }

    teams = teamResult.data || [];
    players = playerResult.data || [];
    matches = matchResult.data || [];

    opts($("homeTeam"), teams, team => team.name);
    opts($("awayTeam"), teams, team => team.name);

    const matchLabel = match =>
      `${teams.find(team => String(team.id) === String(match.home_team_id))?.name || "Home"} vs ` +
      `${teams.find(team => String(team.id) === String(match.away_team_id))?.name || "Away"} ` +
      `(${match.status})`;

    opts($("resultMatch"), matches, matchLabel);
    opts($("eventMatch"), matches, matchLabel);

    opts(
      $("eventPlayer"),
      players.filter(player => player.registration_status === "approved"),
      player =>
        `${player.full_name} — ${
          teams.find(team => String(team.id) === String(player.team_id))?.name || ""
        }`
    );

    await renderTeamLinks();
    renderPendingPlayers();
    await refreshDraw();
  }

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

  function renderPendingPlayers() {
    const pending = players.filter(
      player => player.registration_status === "pending"
    );

    $("pending").innerHTML = pending.map(player => `
      <div class="panel">
        <b>${BANTY.esc(player.full_name)}</b> —
        ${BANTY.esc(
          teams.find(team => String(team.id) === String(player.team_id))?.name || "Team"
        )}
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

  // CLEAR ALL GROUP ASSIGNMENTS

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
      // Unpublish first so the public website cannot show the old draw.
      const { error: settingsError } = await client
        .from("tournament_draw_settings")
        .update({
          is_published: false,
          updated_at: new Date().toISOString()
        })
        .eq("id", true);

      if (settingsError) throw settingsError;

      // Delete only group assignments. This does not delete teams.
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

  // TEAM DELETION

  function confirmDeleteTeam(teamName) {
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

      dialog.querySelector("strong").textContent = teamName;

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

  async function deleteTeam(teamId, teamName) {
    const confirmed = await confirmDeleteTeam(teamName);
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

      msg(`Team "${typeof data === "string" ? data : teamName}" was deleted successfully.`);
      await refresh();
    } catch (error) {
      msg(error.message || "Could not delete this team.", true);
      if (button) button.disabled = false;
    }
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
