
(function () {
  "use strict";

  const teamName = document.getElementById("teamName");
  const roster = document.getElementById("roster");
  const notice = document.getElementById("notice");
  const refreshButton = document.getElementById("refreshRoster");

  const token =
    new URLSearchParams(window.location.search).get("token") || "";

  function showNotice(message, isError) {
    notice.hidden = false;
    BANTY.message(notice, message, Boolean(isError));
  }

  function createStatusBadge(statusValue) {
    const status = String(statusValue || "pending").toLowerCase();

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

    const selected = statuses[status] || statuses.pending;
    const badge = document.createElement("span");

    badge.textContent = selected.symbol + " " + selected.label;
    badge.style.display = "inline-block";
    badge.style.padding = "6px 12px";
    badge.style.borderRadius = "999px";
    badge.style.fontWeight = "700";
    badge.style.fontSize = "14px";
    badge.style.color = selected.color;
    badge.style.backgroundColor = selected.background;
    badge.style.marginTop = "6px";

    return badge;
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
      jersey.textContent =
        "Jersey number: " +
        (player.jersey_number == null
          ? "Not provided"
          : player.jersey_number);

      const statusLine = document.createElement("p");
      statusLine.textContent = "Registration status: ";

      const badge = createStatusBadge(player.registration_status);
      statusLine.appendChild(badge);

      card.append(name, jersey, statusLine);
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

      const result = await client.rpc(
        "get_team_registration_status",
        { p_token: token }
      );

      if (result.error) {
        throw result.error;
      }

      const data = result.data;

      if (!data || !data.team_name) {
        throw new Error("This team link is invalid or inactive.");
      }

      teamName.textContent = data.team_name;

      renderRoster(
        Array.isArray(data.players) ? data.players : []
      );
    } catch (error) {
      console.error("Unable to load team roster:", error);

      teamName.textContent = "Team roster unavailable";
      roster.replaceChildren();

      showNotice(
        error.message || "Unable to load the roster. Please try again.",
        true
      );
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener("click", loadRoster);

  loadRoster();
})();
