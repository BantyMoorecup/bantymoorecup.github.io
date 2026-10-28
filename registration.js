
(function () {
  const form = document.getElementById("regForm");
(function () {
  const teamName = document.getElementById("teamName");
  const roster = document.getElementById("roster");
  const notice = document.getElementById("notice");
  const refreshButton = document.getElementById("refreshRoster");

  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  function showNotice(message, isError = false) {
    notice.hidden = false;
    BANTY.message(notice, message, isError);
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
        (player.jersey_number == null ? "Not provided" : player.jersey_number);

      const status = document.createElement("p");
      const value = String(player.registration_status || "pending").toLowerCase();

      const labels = {
        pending: "Pending approval",
        approved: "Approved",
        rejected: "Rejected"
      };

      status.textContent = "Registration status: " + (labels[value] || "Pending approval");
      status.className = "notice";

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
        throw new Error("This link is missing its team token. Please use the private link supplied by the tournament admin.");
      }

      const client = await BANTY.ready();
      const { data, error } = await client.rpc(
        "get_team_registration_status",
        { p_token: token }
      );

      if (error) throw error;

      if (!data || !data.team_name) {
        throw new Error("This team link is invalid or inactive. Please contact the tournament admin.");
      }

      teamName.textContent = data.team_name;
      renderRoster(Array.isArray(data.players) ? data.players : []);
    } catch (error) {
      teamName.textContent = "Team roster unavailable";
      roster.textContent = "";
      showNotice(error.message || "Could not load the roster.", true);
    } finally {
      refreshButton.disabled = false;
    }
  }

  refreshButton.addEventListener("click", loadRoster);
  loadRoster();
})();

  const fields = document.getElementById("playerFields");
  const notice = document.getElementById("notice");
  const tokenInput = document.getElementById("teamToken");
  const params = new URLSearchParams(location.search);
  const token = params.get("token") || "";

  tokenInput.value = token;

  const teamHeading = document.createElement("h2");
  teamHeading.textContent = "Verifying team...";
  teamHeading.id = "teamNameHeading";
  form.parentNode.insertBefore(teamHeading, form);

  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;

  async function loadTeamName() {
    const currentToken = tokenInput.value.trim();

    if (!currentToken) {
      teamHeading.textContent = "Team registration";
      submitButton.disabled = true;
      return;
    }

    submitButton.disabled = true;
    teamHeading.textContent = "Verifying team...";

    try {
      const client = await BANTY.ready();
      const { data, error } = await client.rpc(
        "get_team_name_for_registration",
        { p_token: currentToken }
      );

      if (error) throw error;

      if (!data) {
        throw new Error("This registration link is invalid or inactive.");
      }

      teamHeading.textContent = "Register players for " + data;
      submitButton.disabled = false;
    } catch (error) {
      teamHeading.textContent = "Team could not be verified";
      BANTY.message(
        notice,
        error.message || "Please check the team registration link.",
        true
      );
      notice.hidden = false;
    }
  }

  function addField() {
    if (fields.children.length >= 6) return;

    const number = fields.children.length + 1;
    const box = document.createElement("div");
    box.className = "panel";
    box.innerHTML =
      '<label>Player ' + number + ' full name</label>' +
      '<input name="player" required maxlength="100" ' +
      'autocomplete="name" placeholder="Full name">' +
      '<label>Jersey number (optional)</label>' +
      '<input name="jersey" type="number" min="0" max="999" ' +
      'placeholder="Number">';

    fields.appendChild(box);
    document.getElementById("addPlayer").disabled =
      fields.children.length >= 6;
  }

  addField();

  document.getElementById("addPlayer").addEventListener(
    "click",
    addField
  );

  tokenInput.addEventListener("change", loadTeamName);

  loadTeamName();

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (submitButton.disabled) return;

    notice.hidden = false;
    BANTY.message(notice, "Submitting...");

    try {
      const client = await BANTY.ready();

      if (Date.now() > BANTY.deadline.getTime()) {
        throw new Error(
          "The registration deadline has passed. Please contact the tournament admin."
        );
      }

      const players = Array.from(fields.children).map(function (box) {
        const name = box.querySelector('[name="player"]').value.trim();
        const jersey = box.querySelector('[name="jersey"]').value;

        return {
          full_name: name,
          jersey_number: jersey === "" ? null : Number(jersey)
        };
      });

      if (players.some(function (player) {
        return !player.full_name;
      })) {
        throw new Error("Enter every player's full name.");
      }

      const { data, error } = await client.rpc(
        "submit_team_registration",
        {
          p_token: tokenInput.value.trim(),
          p_players: players
        }
      );

      if (error) throw error;

      BANTY.message(
        notice,
        "Registration submitted for " +
          (data && data.team_name ? data.team_name : "your team") +
          ". Your players are pending admin approval."
      );

      fields.innerHTML = "";
      addField();
      form.reset();
      tokenInput.value = token;
      await loadTeamName();
    } catch (error) {
      BANTY.message(
        notice,
        error.message || "Registration failed. Please check the link and try again.",
        true
      );
    }
  });
})();
