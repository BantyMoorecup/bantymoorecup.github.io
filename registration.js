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
        (player.jersey_number == null
          ? "Not provided"
          : player.jersey_number);

      const value = String(
        player.registration_status || "pending"
      ).toLowerCase();

      const statuses = {
        approved: {
          label: "Verified",
          symbol: "✓",
          color: "#15803d",
          background: "#dcfce7"
        },
        pending: {
          label: "Pending",
          symbol: "◷",
          color: "#a16207",
          background: "#fef3c7"
        },
        rejected: {
          label: "Rejected",
          symbol: "✕",
          color: "#b91c1c",
          background: "#fee2e2"
        }
      };

      const current = statuses[value] || statuses.pending;

      const status = document.createElement("span");
      status.textContent = current.symbol + " " + current.label;

      Object.assign(status.style, {
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 12px",
        borderRadius: "999px",
        fontWeight: "600",
        fontSize: "14px",
        color: current.color,
        backgroundColor: current.background
      });

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
```
