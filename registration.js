
(function () {
  "use strict";

  const teamName = document.getElementById("teamName");
  const roster = document.getElementById("roster");
  const notice = document.getElementById("notice");
  const refreshButton = document.getElementById("refreshRoster");
  const form = document.getElementById("playerRegistrationForm");
  const playerFields = document.getElementById("playerFields");
  const addPlayerButton = document.getElementById("addPlayer");
  const printButton = document.getElementById("printIdCards");
  const printCards = document.getElementById("printCards");

  const token =
    new URLSearchParams(window.location.search).get("token") || "";

  let playerCount = 1;
  let approvedPlayers = [];
  let currentTeamName = "";

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

  function isApproved(player) {
    return String(player.registration_status || "").toLowerCase() === "approved";
  }

  function getPlayerId(player, index) {
    const databaseId =
      player.player_id ||
      player.id ||
      player.registration_id;

    if (
      databaseId !== undefined &&
      databaseId !== null &&
      String(databaseId).trim()
    ) {
      return String(databaseId);
    }

    const teamSlug = currentTeamName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 10) || "TEAM";

    return "BMPC-" + teamSlug + "-" + String(index + 1).padStart(3, "0");
  }

  function getPhotoUrl(player) {
    return (
      player.passport_photo_url ||
      player.photo_url ||
      player.signed_photo_url ||
      player.passport_photo_signed_url ||
      player.photo_signed_url ||
      ""
    );
  }

  function getInitials(name) {
    return String(name || "Player")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(function (part) {
        return part.charAt(0).toUpperCase();
      })
      .join("") || "P";
  }

  function renderRoster(players) {
    roster.replaceChildren();

    approvedPlayers = players.filter(isApproved);
    printButton.disabled = approvedPlayers.length === 0;

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

      const photoUrl = getPhotoUrl(player);

      if (photoUrl) {
        const photo = document.createElement("img");
        photo.src = photoUrl;
        photo.alt = "Photo of " + (player.full_name || "player");
        photo.style.width = "80px";
        photo.style.height = "100px";
        photo.style.objectFit = "cover";
        photo.style.borderRadius = "8px";
        photo.style.display = "block";
        photo.style.marginBottom = "12px";

        photo.addEventListener("error", function () {
          photo.remove();
        });

        card.appendChild(photo);
      }

      card.append(name, jersey, statusLine);
      roster.appendChild(card);
    });
  }

  async function loadRoster() {
    refreshButton.disabled = true;
    printButton.disabled = true;
    teamName.textContent = "Loading team...";
    roster.textContent = "Loading roster...";
    notice.hidden = true;
    printCards.replaceChildren();

    try {
      if (!token) {
        throw new Error("The team token is missing from this link.");
      }

      const client = await BANTY.ready();

      // Fetch the roster and temporary photo URLs from the Edge Function.
      const result = await client.functions.invoke("get-team-roster", {
        body: { token: token }
      });

      if (result.error) {
        let message =
          result.error.message || "Unable to load the team roster.";

        if (result.error.context instanceof Response) {
          try {
            const details = await result.error.context.json();
            if (details.error) message = details.error;
          } catch (_) {}
        }

        throw new Error(message);
      }

      const data = result.data;

      if (!data || !data.team_name || !Array.isArray(data.players)) {
        throw new Error(
          data?.error || "The roster response is incomplete."
        );
      }

      currentTeamName = data.team_name;
      teamName.textContent = currentTeamName;

      renderRoster(data.players);
    } catch (error) {
      console.error("Unable to load team roster:", error);

      currentTeamName = "";
      approvedPlayers = [];
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

  function appendTextElement(parent, tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function createPrintCard(player, index) {
    const card = document.createElement("article");
    card.className = "print-id-card";

    const header = document.createElement("div");
    header.className = "print-card-header";

    const logo = document.createElement("img");
    logo.className = "print-card-logo";
    logo.src = "banty-moore-logo.jpg";
    logo.alt = "Banty Moore logo";

    const headingWrap = document.createElement("div");

    appendTextElement(
      headingWrap,
      "div",
      "print-card-heading",
      "BANTY MOORE PRESTIGE CUP"
    );

    appendTextElement(
      headingWrap,
      "div",
      "print-card-subtitle",
      "OFFICIAL PLAYER ID • 2026"
    );

    header.append(logo, headingWrap);

    const body = document.createElement("div");
    body.className = "print-card-body";

    const photoUrl = getPhotoUrl(player);

    if (photoUrl) {
      const photo = document.createElement("img");
      photo.className = "print-card-photo";
      photo.src = photoUrl;
      photo.alt = "Photo of " + (player.full_name || "player");
      photo.referrerPolicy = "no-referrer";

      photo.addEventListener("error", function () {
        const placeholder = document.createElement("div");
        placeholder.className = "print-card-placeholder";
        placeholder.textContent = getInitials(player.full_name);
        photo.replaceWith(placeholder);
      });

      body.appendChild(photo);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "print-card-placeholder";
      placeholder.textContent = getInitials(player.full_name);
      body.appendChild(placeholder);
    }

    const details = document.createElement("div");
    details.className = "print-card-details";

    appendTextElement(
      details,
      "div",
      "print-card-name",
      player.full_name || "Unnamed player"
    );

    appendTextElement(
      details,
      "div",
      "print-card-team",
      "TEAM: " + currentTeamName
    );

    appendTextElement(
      details,
      "div",
      "print-card-number",
      "PLAYER ID: " + getPlayerId(player, index)
    );

    appendTextElement(
      details,
      "div",
      "print-card-status",
      "STATUS: APPROVED"
    );

    if (player.jersey_number !== undefined && player.jersey_number !== null) {
      appendTextElement(
        details,
        "div",
        "print-card-status",
        "JERSEY: " + player.jersey_number
      );
    }

    body.appendChild(details);

    const footer = document.createElement("div");
    footer.className = "print-card-footer";
    footer.textContent = "PRESTIGE • PASSION • FOOTBALL";

    card.append(header, body, footer);
    return card;
  }

  function printApprovedCards() {
    const latestApproved = approvedPlayers.filter(isApproved);

    if (!latestApproved.length) {
      showNotice("There are no approved players to print cards for.", true);
      return;
    }

    printCards.replaceChildren();

    latestApproved.forEach(function (player, index) {
      printCards.appendChild(createPrintCard(player, index));
    });

    document.body.classList.add("id-printing");

    const cleanup = function () {
      document.body.classList.remove("id-printing");
      window.removeEventListener("afterprint", cleanup);
    };

    window.addEventListener("afterprint", cleanup);

    const images = Array.from(printCards.querySelectorAll("img"));

    Promise.all(
      images.map(function (image) {
        if (image.complete) return Promise.resolve();

        return new Promise(function (resolve) {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      })
    ).then(function () {
      window.print();
    });
  }

  function updatePlayerButtons() {
    addPlayerButton.disabled = playerCount >= 6;

    addPlayerButton.textContent =
      playerCount >= 6
        ? "Maximum of 6 players reached"
        : "Add another player";
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

          if (labels[0]) {
            labels[0].textContent =
              "Player " + number + " — Full name";
          }

          if (labels[1]) {
            labels[1].textContent =
              "Player " + number + " — Passport photograph";
          }
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
  printButton.addEventListener("click", printApprovedCards);

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
