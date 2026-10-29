
(function () {
  "use strict";

  const teamName = document.getElementById("teamName");
  const roster = document.getElementById("roster");
  const notice = document.getElementById("notice");
  const refreshButton = document.getElementById("refreshRoster");
  const form = document.getElementById("playerRegistrationForm");
  const playerFields = document.getElementById("playerFields");
  const addPlayerButton = document.getElementById("addPlayer");

  const token =
    new URLSearchParams(window.location.search).get("token") || "";

  let playerCount = 1;

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
      statusLine.appendChild(
        createStatusBadge(player.registration_status)
      );

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

      if (result.error) throw result.error;

      const data = result.data;

      if (!data || !data.team_name) {
        throw new Error("This team link is invalid or inactive.");
      }

      teamName.textContent = data.team_name;
      renderRoster(Array.isArray(data.players) ? data.players : []);
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

  function updatePlayerButtons() {
    addPlayerButton.disabled = playerCount >= 6;
    addPlayerButton.textContent =
      playerCount >= 6 ? "Maximum of 6 players reached" : "Add another player";
  }

  function addPlayerField() {
    if (playerCount >= 6) return;

    playerCount += 1;

    const entry = document.createElement("div");
    entry.className = "player-entry panel";

    const heading = document.createElement("h4");
    heading.textContent = "Player " + playerCount;

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Player " + playerCount + " — Full name";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.name = "full_name";
    nameInput.required = true;
    nameInput.maxLength = 100;
    nameInput.placeholder = "Enter player's full name";

    const photoLabel = document.createElement("label");
    photoLabel.textContent =
      "Player " + playerCount + " — Passport photograph";

    const photoInput = document.createElement("input");
    photoInput.type = "file";
    photoInput.name = "passport_photo";
    photoInput.accept = "image/jpeg,image/png,image/webp";
    photoInput.required = true;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "button";
    removeButton.textContent = "Remove player";

    removeButton.addEventListener("click", function () {
      entry.remove();
      playerCount -= 1;

      Array.from(playerFields.querySelectorAll(".player-entry"))
        .forEach(function (item, index) {
          const number = index + 1;
          const labels = item.querySelectorAll("label");
          const heading = item.querySelector("h4");

          if (heading) heading.textContent = "Player " + number;
          if (labels[0]) labels[0].textContent =
            "Player " + number + " — Full name";
          if (labels[1]) labels[1].textContent =
            "Player " + number + " — Passport photograph";
        });

      updatePlayerButtons();
    });

    entry.append(
      heading,
      nameLabel,
      nameInput,
      photoLabel,
      photoInput,
      removeButton
    );

    playerFields.appendChild(entry);
    updatePlayerButtons();
  }

  addPlayerButton.addEventListener("click", addPlayerField);

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    notice.hidden = true;

    if (!token) {
      showNotice("Your team registration link is missing its token.", true);
      return;
    }

    const entries = Array.from(
      playerFields.querySelectorAll(".player-entry")
    );

    if (entries.length < 1 || entries.length > 6) {
      showNotice("Register between 1 and 6 players at a time.", true);
      return;
    }

    const players = [];

    for (let i = 0; i < entries.length; i++) {
      const nameInput = entries[i].querySelector(
        'input[name="full_name"]'
      );
      const photoInput = entries[i].querySelector(
        'input[name="passport_photo"]'
      );
      const fullName = nameInput.value.trim();
      const photo = photoInput.files[0];

      if (fullName.length < 2 || fullName.length > 100) {
        showNotice(
          "Enter a valid full name for player " + (i + 1) + ".",
          true
        );
        nameInput.focus();
        return;
      }

      if (!photo) {
        showNotice(
          "Choose a passport photograph for player " + (i + 1) + ".",
          true
        );
        photoInput.focus();
        return;
      }

      players.push({ full_name: fullName });
    }

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    addPlayerButton.disabled = true;
    submitButton.textContent = "Submitting...";

    try {
      const client = await BANTY.ready();
      const payload = new FormData();

      payload.append("token", token);
      payload.append("players", JSON.stringify(players));

      entries.forEach(function (entry, index) {
        const photo = entry.querySelector(
          'input[name="passport_photo"]'
        ).files[0];

        payload.append("photo_" + index, photo, photo.name);
      });

      const result = await client.functions.invoke(
        "register-team-players",
        { body: payload }
      );

      if (result.error) {
        let message = result.error.message || "Registration failed.";

        if (result.error.context instanceof Response) {
          try {
            const details = await result.error.context.json();
            if (details.error) message = details.error;
          } catch (_) {}
        }

        throw new Error(message);
      }

      if (!result.data || !result.data.success) {
        throw new Error(
          result.data?.error || "Registration could not be completed."
        );
      }

      showNotice(
        result.data.submitted +
          " player(s) submitted for admin approval.",
        false
      );

      form.reset();

      playerFields.replaceChildren();
      playerCount = 0;
      addPlayerField();
      updatePlayerButtons();

      await loadRoster();
    } catch (error) {
      console.error("Player registration failed:", error);

      showNotice(
        error.message ||
          "Unable to submit registrations. Please try again.",
        true
      );
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit registrations";
      updatePlayerButtons();
    }
  });

  refreshButton.addEventListener("click", loadRoster);

  updatePlayerButtons();
  loadRoster();
})();
