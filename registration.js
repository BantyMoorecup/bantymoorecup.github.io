
(function () {
  const teamName = document.getElementById("teamName");
  const roster = document.getElementById("roster");
  const notice = document.getElementById("notice");
  const refreshButton = document.getElementById("refreshRoster");

  const token = new URLSearchParams(window.location.search).get("token") || "";

  function showNotice(message, isError) {
    notice.hidden = false;
    BANTY.message(notice, message, Boolean(isError));
  }

  function renderRoster(players) {
    roster.replaceChildren();

    if (!players.length) {
      const empty = document.createElement("p");
      empty.textContent = "No players registered for this team yet.";
      roster.appendChild(empty);
      return;
    }

    players.forEach(function (player) {
      const card = document.createElement("div");
      card.className = "panel";

      const name = document.createElement("h3");
      name.textContent = player.full_name || "Unnamed player";

      const jersey = document.createElement("p");
      jersey.textContent = "Jersey number: " +
        (player.jersey_number == null ? "Not provided" : player.jersey_number);

      const status = document.createElement("p");
      const value = String(player.registration_status || "pending").toLowerCase();
      const labels = {
        pending: "Pending approval",
        approved: "Approved",
        rejected: "Rejected"
      };

      status.textContent = "Registration status: " +
        (labels[value] || "Pending approval");

      card.append(name, jersey, status);
      roster.appendChild(card);
    });
  }

  async function loadRoster() {
    refreshButton.disabled = true;
    teamName.textContent = "Loading team...";
    roster.textContent = "Loading roster...";
    notice.hidden = true;

    try {
      if (!token) {
        throw new Error("The team token is missing from this link.");
      }

      const client = await BANTY.ready();
      const { data, error } = await client.rpc(
        "get_team_registration_status",
        { p_token: token }
      );

      if (error) throw error;

      if (!data || !data.team_name) {
        throw new Error("This team link is invalid or inactive.");
      }

      teamName.textContent = data.team_name;
      renderRoster(Array.isArray(data.players) ? data.players : []);
    } catch (error) {
      teamName.textContent = "Team roster unavailable";
      roster.replaceChildren();
      showNotice(error.message || "Unable to load the roster.", true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener("click", loadRoster);
  loadRoster();
})();
