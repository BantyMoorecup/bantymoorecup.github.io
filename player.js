
(async function () {
  const $ = id => document.getElementById(id);

  const showError = message => {
    $("player-name").textContent = "PLAYER PROFILE UNAVAILABLE";
    $("player-message").textContent = message;
  };

  function showPlayerPhoto(url) {
    let avatar = document.querySelector(".player-avatar");

    if (!avatar) {
      const header = document.querySelector(".player-profile-header");
      const identity = document.querySelector(".player-identity");

      if (header) {
        avatar = document.createElement("div");
        avatar.className = "player-avatar";

        if (identity) {
          header.insertBefore(avatar, identity);
        } else {
          header.prepend(avatar);
        }
      }
    }

    if (!avatar) return;

    avatar.replaceChildren();

    if (url) {
      const image = document.createElement("img");
      image.src = url;
      image.alt = "Player photo";
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.objectFit = "cover";
      image.style.borderRadius = "inherit";

      image.onerror = () => {
        avatar.textContent = "PLAYER";
      };

      avatar.appendChild(image);
    } else {
      avatar.textContent = "PLAYER";
    }
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const playerId = params.get("id");

    if (!playerId) {
      throw new Error("No player was selected.");
    }

    const client = await BANTY.ready();

    const [
      { data: player, error: playerError },
      { data: teams, error: teamsError },
      { data: goals, error: goalsError },
      { data: cards, error: cardsError }
    ] = await Promise.all([
      client.from("players")
        .select("id,team_id,full_name,jersey_number,registration_status,passport_photo_path")
        .eq("id", playerId)
        .eq("registration_status", "approved")
        .maybeSingle(),

      client.from("teams")
        .select("id,name"),

      client.from("goals")
        .select("player_id")
        .eq("player_id", playerId),

      client.from("cards")
        .select("player_id,card_type")
        .eq("player_id", playerId)
    ]);

    if (playerError || teamsError || goalsError || cardsError) {
      throw new Error("Unable to load player statistics. Please try again.");
    }

    if (!player) {
      throw new Error("This player profile could not be found.");
    }

    const team = (teams || []).find(
      t => String(t.id) === String(player.team_id)
    );

    const goalCount = (goals || []).length;

    const yellowCount = (cards || []).filter(
      c => c.card_type === "yellow"
    ).length;

    const redCount = (cards || []).filter(
      c => c.card_type === "red"
    ).length;

    const teamName = team?.name || "Unknown team";

    const jersey = player.jersey_number == null
      ? "Not assigned"
      : `#${player.jersey_number}`;

    $("player-name").textContent = player.full_name;
    $("player-team").textContent = teamName;
    $("player-number").textContent =
      player.jersey_number == null ? "—" : `#${player.jersey_number}`;

    $("player-jersey").textContent = jersey;
    $("player-team-info").textContent = teamName;
    $("player-number-info").textContent = jersey;
    $("player-registration").textContent = "Approved";

    document.title =
      `${player.full_name} | Banty Moore Prestige Cup`;

    $("player-stats").innerHTML = `
      <div class="player-stat">
        <span>GOALS</span>
        <strong>${goalCount}</strong>
      </div>

      <div class="player-stat">
        <span>YELLOW CARDS</span>
        <strong>${yellowCount}</strong>
      </div>

      <div class="player-stat">
        <span>RED CARDS</span>
        <strong>${redCount}</strong>
      </div>
    `;

    // Load the player's photo from the private Supabase bucket.
    showPlayerPhoto(null);

    if (player.passport_photo_path) {
      const { data: photoData, error: photoError } =
        await client.storage
          .from("players-passports")
          .createSignedUrl(player.passport_photo_path, 3600);

      if (!photoError && photoData?.signedUrl) {
        showPlayerPhoto(photoData.signedUrl);
      } else {
        console.error("Player photo error:", photoError);
      }
    }

    $("player-message").textContent =
      "Official player statistics for the Banty Moore Prestige Cup 2026.";

  } catch (error) {
    showError(error.message || "Unable to load player profile.");
    console.error(error);
  }
})();
