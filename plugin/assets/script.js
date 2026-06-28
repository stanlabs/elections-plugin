(function () { "use strict";

const DATA_FILE_PATH = (typeof erConfig !== "undefined" && erConfig.dataUrl) ? erConfig.dataUrl : "";
const DEFAULT_CANDIDATE_IMAGE_URL =
  "https://secure.gravatar.com/avatar/?s=64&d=mm&r=g";

const tabsEl = document.getElementById("erJurisdictionTabs");
const resultsEl = document.getElementById("erResultsContainer");
const roundTemplate = document.getElementById("erRoundTemplate");
const yearLogoEl = document.getElementById("erYearLogo");

const validStatuses = new Set(["active", "winner", "eliminated"]);
let electionData = [];
let selectedJurisdiction = "";
let partyStyles = {};

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(value) {
  return `${Number(value).toFixed(2)}%`;
}

function normalizeParty(party) {
  return (party || "Independent").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const defaultPartyStyle = {
  barColor: "#7850be",
  winnerBackground: "#7850be",
  winnerText: "#ffffff"
};

function normalizePartyStyles(rawStyles) {
  const normalized = {};
  if (!rawStyles || typeof rawStyles !== "object" || Array.isArray(rawStyles)) {
    return normalized;
  }

  Object.keys(rawStyles).forEach((partyName) => {
    const style = rawStyles[partyName];
    if (!style || typeof style !== "object" || Array.isArray(style)) {
      return;
    }

    const partyKey = normalizeParty(partyName);
    normalized[partyName] = {
      barColor: typeof style.barColor === "string" ? style.barColor : defaultPartyStyle.barColor,
      winnerBackground:
        typeof style.winnerBackground === "string"
          ? style.winnerBackground
          : typeof style.barColor === "string"
          ? style.barColor
          : defaultPartyStyle.winnerBackground,
      winnerText: typeof style.winnerText === "string" ? style.winnerText : defaultPartyStyle.winnerText
    };

    normalized[partyKey] = normalized[partyName];
  });

  return normalized;
}

function getPartyStyle(party) {
  return partyStyles[party] || partyStyles[normalizeParty(party)] || defaultPartyStyle;
}

function deriveRaceTypeLabel(race) {
  if (race.seats > 1) return "Multi-Winner Ranked Choice";
  if (race.rounds.length > 1) return "Single Candidate Instant Runoff Voting";
  if (race.candidates.length === 1) return "Single-Candidate / Unopposed";
  return "First-Past-the-Post";
}

function validateAndNormalizeData(payload) {
  const errors = [];
  const jurisdictions = Array.isArray(payload) ? payload : payload?.jurisdictions;
  const normalizedPartyStyleTable = normalizePartyStyles(payload?.partyStyles);

  if (!Array.isArray(jurisdictions) || jurisdictions.length === 0) {
    throw new Error("Election data must include a non-empty 'jurisdictions' array.");
  }

  jurisdictions.forEach((jurisdictionGroup, jurisdictionIndex) => {
    if (!jurisdictionGroup || typeof jurisdictionGroup.jurisdiction !== "string") {
      errors.push(`Jurisdiction at index ${jurisdictionIndex} is missing a valid 'jurisdiction'.`);
    }
    if (!Array.isArray(jurisdictionGroup?.elections) || jurisdictionGroup.elections.length === 0) {
      errors.push(`Jurisdiction '${jurisdictionGroup?.jurisdiction || jurisdictionIndex}' must include elections.`);
      return;
    }

    jurisdictionGroup.elections.forEach((election, electionIndex) => {
      if (!election?.id || !election?.title || !election?.updatedAt) {
        errors.push(
          `Election at jurisdiction '${jurisdictionGroup.jurisdiction}', index ${electionIndex} must include id/title/updatedAt.`
        );
      }
      if (!Array.isArray(election?.races) || election.races.length === 0) {
        errors.push(`Election '${election?.id || electionIndex}' must include races.`);
        return;
      }

      election.races.forEach((race, raceIndex) => {
        if (!race?.raceId || !race?.name) {
          errors.push(
            `Race at election '${election.id || electionIndex}', index ${raceIndex} must include raceId/name.`
          );
        }
        if (!Number.isFinite(race?.seats) || race.seats < 1) {
          errors.push(`Race '${race?.raceId || raceIndex}' must include seats >= 1.`);
        }
        if (!Number.isFinite(race?.ballotsCast) || race.ballotsCast <= 0) {
          errors.push(`Race '${race?.raceId || raceIndex}' must include ballotsCast > 0.`);
        }
        if (!Array.isArray(race?.candidates) || race.candidates.length === 0) {
          errors.push(`Race '${race?.raceId || raceIndex}' must include candidates.`);
          return;
        }

        const candidateIds = new Set();
        race.candidates.forEach((candidate, candidateIndex) => {
          if (!candidate?.id || !candidate?.name || !candidate?.party) {
            errors.push(
              `Race '${race.raceId}': candidate at index ${candidateIndex} must include id/name/party.`
            );
          }
          if (candidate?.imageUrl !== undefined && typeof candidate.imageUrl !== "string") {
            errors.push(
              `Race '${race.raceId}': candidate '${candidate.id}' imageUrl must be a string when provided.`
            );
          }
          if (candidateIds.has(candidate?.id)) {
            errors.push(`Race '${race.raceId}': duplicate candidate id '${candidate.id}'.`);
          }
          candidateIds.add(candidate?.id);
        });

        if (!Array.isArray(race?.rounds) || race.rounds.length === 0) {
          errors.push(`Race '${race.raceId}': must include at least one round.`);
          return;
        }

        race.rounds.forEach((round, roundIndex) => {
          if (!Number.isFinite(round?.roundNumber)) {
            errors.push(`Race '${race.raceId}': round at index ${roundIndex} missing roundNumber.`);
          }
          if (!Array.isArray(round?.results) || round.results.length === 0) {
            errors.push(`Race '${race.raceId}': round ${round?.roundNumber || roundIndex} needs results.`);
            return;
          }

          round.results.forEach((result, resultIndex) => {
            if (!candidateIds.has(result?.candidateId)) {
              errors.push(
                `Race '${race.raceId}': round ${round.roundNumber}, result ${resultIndex} has unknown candidateId '${result?.candidateId}'.`
              );
            }
            if (!Number.isFinite(result?.votes) && !Number.isFinite(result?.percent)) {
              errors.push(
                `Race '${race.raceId}': round ${round.roundNumber}, candidate '${result?.candidateId}' needs votes or percent.`
              );
            }
            if (result?.status && !validStatuses.has(result.status)) {
              errors.push(
                `Race '${race.raceId}': round ${round.roundNumber}, candidate '${result?.candidateId}' has invalid status '${result.status}'.`
              );
            }
          });
        });
      });
    });
  });

  if (errors.length > 0) {
    throw new Error(`Election data validation failed:\n- ${errors.join("\n- ")}`);
  }

  return {
    partyStyles: normalizedPartyStyleTable,
    jurisdictions: jurisdictions.map((jurisdictionGroup) => ({
      ...jurisdictionGroup,
      elections: jurisdictionGroup.elections.map((election) => ({
        ...election,
        races: election.races.map((race) => normalizeRace(race))
      }))
    }))
  };
}

function normalizeRace(race) {
  const candidateById = new Map(race.candidates.map((candidate) => [candidate.id, candidate]));
  const statusByCandidateId = new Map(race.candidates.map((candidate) => [candidate.id, "active"]));
  const votesByCandidateId = new Map(race.candidates.map((candidate) => [candidate.id, 0]));

  const rounds = [...race.rounds]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((round) => {
      const candidates = round.results
        .map((explicit) => {
          const candidate = candidateById.get(explicit.candidateId);
          if (!candidate) {
            return null;
          }

          const previousVotes = votesByCandidateId.get(candidate.id) || 0;
          let votes = previousVotes;
          let percent = (previousVotes / race.ballotsCast) * 100 || 0;

          if (Number.isFinite(explicit.votes)) {
            votes = Number(explicit.votes);
          } else if (Number.isFinite(explicit.percent)) {
            votes = Math.round((Number(explicit.percent) / 100) * race.ballotsCast);
          }

          if (Number.isFinite(explicit.percent)) {
            percent = Number(explicit.percent);
          } else {
            percent = (votes / race.ballotsCast) * 100 || 0;
          }

          if (explicit.status) {
            statusByCandidateId.set(candidate.id, explicit.status);
          }

          const status = statusByCandidateId.get(candidate.id) || "active";
          votesByCandidateId.set(candidate.id, votes);

          return {
            candidateId: candidate.id,
            name: candidate.name,
            party: candidate.party,
            imageUrl: candidate.imageUrl || DEFAULT_CANDIDATE_IMAGE_URL,
            votes,
            percent,
            status
          };
        })
        .filter(Boolean);

      return {
        round: round.roundNumber,
        note: round.note || "",
        candidates
      };
    });

  return {
    ...race,
    rounds
  };
}

function getFinalRound(race) {
  return race.rounds[race.rounds.length - 1];
}

function getSummaryWinnerIds(race) {
  const finalRound = getFinalRound(race);
  const winnerIds = finalRound.candidates
    .filter((candidate) => candidate.status === "winner")
    .map((candidate) => candidate.candidateId);

  if (winnerIds.length > 0) return new Set(winnerIds);

  const sorted = [...finalRound.candidates].sort((a, b) => b.votes - a.votes);
  return new Set(sorted.slice(0, race.seats).map((candidate) => candidate.candidateId));
}

function getSingleWinner(race) {
  if (race.seats !== 1) return null;
  const finalRound = getFinalRound(race);
  const winners = finalRound.candidates.filter((c) => c.status === "winner");
  return winners.length === 1 ? winners[0] : null;
}

function getWinnerSummary(race) {
  const finalRound = getFinalRound(race);
  const winners = finalRound.candidates.filter((candidate) => candidate.status === "winner");

  if (winners.length > 0) {
    if (race.seats === 1) return `Winner: ${winners[0].name}`;
    return `Elected: ${winners.map((candidate) => candidate.name).join(", ")}`;
  }

  const sorted = [...finalRound.candidates].sort((a, b) => b.votes - a.votes);
  const top = sorted.slice(0, race.seats);
  if (race.seats === 1) return `Leader: ${top[0]?.name || "TBD"}`;
  return `Leaders: ${top.map((candidate) => candidate.name).join(", ")}`;
}

async function loadElectionDataFromJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${path} (${response.status} ${response.statusText})`);
  }
  const json = await response.json();
  return validateAndNormalizeData(json);
}

function renderYearLogo() {
  if (!yearLogoEl) return;

  const yearDigits = String(new Date().getFullYear()).split("");
  yearLogoEl.innerHTML = "";

  yearDigits.forEach((digit, index) => {
    const part = document.createElement("span");
    part.className = `year-logo-digit ${index % 2 === 0 ? "er-year-logo-red" : "er-year-logo-blue"}`;
    part.textContent = digit;
    yearLogoEl.appendChild(part);
  });
}

function renderTabs() {
  tabsEl.innerHTML = "";
  electionData.forEach((group) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `jurisdiction-tab${selectedJurisdiction === group.jurisdiction ? " active" : ""}`;
    button.textContent = group.jurisdiction;
    button.addEventListener("click", () => {
      selectedJurisdiction = group.jurisdiction;
      renderTabs();
      renderJurisdictionResults();
    });
    tabsEl.appendChild(button);
  });
}

function buildCandidateCell(candidate, isWinner) {
  const td = document.createElement("td");
  const normalizedParty = normalizeParty(candidate.party);
  const style = getPartyStyle(candidate.party);
  td.className = `candidate-cell${isWinner ? " er-er-candidate-cell--winner" : ""}`;

  const bar = document.createElement("span");
  bar.className = `party-bar party-${normalizedParty}`;
  bar.style.backgroundColor = style.barColor;

  const name = document.createElement("span");
  name.className = "er-candidate-name";
  name.textContent = candidate.name;

  const photo = document.createElement("img");
  photo.className = "er-candidate-photo";
  photo.src = candidate.imageUrl || DEFAULT_CANDIDATE_IMAGE_URL;
  photo.alt = `${candidate.name} photo`;
  photo.loading = "lazy";
  photo.referrerPolicy = "no-referrer";
  photo.onerror = () => {
    if (photo.src !== DEFAULT_CANDIDATE_IMAGE_URL) {
      photo.src = DEFAULT_CANDIDATE_IMAGE_URL;
    } else {
      photo.onerror = null;
      photo.style.display = "none";
    }
  };

  td.append(bar, photo, name);

  if (isWinner) {
    td.style.backgroundColor = style.winnerBackground;
    td.style.color = style.winnerText;

    const check = document.createElement("span");
    check.className = "er-candidate-check";
    check.setAttribute("aria-label", "Winner");
    check.style.borderRightColor = style.winnerText;
    check.style.borderBottomColor = style.winnerText;
    td.appendChild(check);
  } else {
    td.style.backgroundColor = "";
    td.style.color = "";
  }

  return td;
}

function renderSummaryTable(race, updatedAt) {
  const winnerIds = getSummaryWinnerIds(race);
  const summaryCandidates = getFinalRound(race).candidates;

  const wrap = document.createElement("div");
  wrap.className = "er-round-table-wrap";

  const metaBar = document.createElement("div");
  metaBar.className = "er-results-meta";
  metaBar.innerHTML = `
    <span>Latest results from ${updatedAt}</span>
    <span>VOTE TOTALS CERTIFIED</span>
  `;
  wrap.appendChild(metaBar);

  const table = document.createElement("table");
  table.className = "er-results-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Candidate</th>
        <th>Party</th>
        <th>Votes</th>
        <th>PCT.</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  summaryCandidates.forEach((candidate) => {
    const row = document.createElement("tr");
    const isWinner = winnerIds.has(candidate.candidateId);

    row.appendChild(buildCandidateCell(candidate, isWinner));

    const partyTd = document.createElement("td");
    partyTd.textContent = candidate.party;
    row.appendChild(partyTd);

    const votesTd = document.createElement("td");
    votesTd.textContent = formatNumber(candidate.votes);
    row.appendChild(votesTd);

    const pctTd = document.createElement("td");
    pctTd.textContent = formatPercent(candidate.percent);
    row.appendChild(pctTd);

    tbody.appendChild(row);
  });

  wrap.appendChild(table);
  return wrap;
}

function renderWinnerBanner(race, jurisdiction) {
  const winner = getSingleWinner(race);
  if (!winner) return null;

  const style = getPartyStyle(winner.party);

  const banner = document.createElement("div");
  banner.className = "er-winner-banner";
  banner.style.backgroundColor = style.winnerBackground;

  const labelRow = document.createElement("div");
  labelRow.className = "er-winner-banner-label";

  const checkIcon = document.createElement("span");
  checkIcon.className = "er-winner-banner-check-icon";
  checkIcon.setAttribute("aria-hidden", "true");

  const labelText = document.createElement("span");
  labelText.textContent = "WINNER";

  labelRow.append(checkIcon, labelText);

  const body = document.createElement("div");
  body.className = "er-winner-banner-body";

  const photo = document.createElement("img");
  photo.className = "er-winner-banner-photo";
  photo.src = winner.imageUrl || DEFAULT_CANDIDATE_IMAGE_URL;
  photo.alt = `${winner.name} photo`;
  photo.loading = "lazy";
  photo.referrerPolicy = "no-referrer";
  photo.onerror = () => {
    if (photo.src !== DEFAULT_CANDIDATE_IMAGE_URL) {
      photo.src = DEFAULT_CANDIDATE_IMAGE_URL;
    } else {
      photo.onerror = null;
      photo.style.display = "none";
    }
  };

  const text = document.createElement("span");
  text.className = "er-winner-banner-text";
  text.textContent = `${winner.name}, ${winner.party}, wins the ${race.name}'s race in ${jurisdiction}.`;

  body.append(photo, text);
  banner.append(labelRow, body);
  return banner;
}

function renderRounds(race) {
  const roundsWrap = document.createElement("div");
  roundsWrap.className = "er-rounds-grid";

  race.rounds.forEach((roundData) => {
    const fragment = roundTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".round-card");
    const titleEl = fragment.querySelector(".round-title");
    const tbody = fragment.querySelector("tbody");
    const noteEl = fragment.querySelector(".round-note");

    titleEl.textContent = `Round ${roundData.round}`;

    roundData.candidates.forEach((candidate) => {
      const row = document.createElement("tr");
      const statusText = candidate.status.charAt(0).toUpperCase() + candidate.status.slice(1);

      row.appendChild(buildCandidateCell(candidate, candidate.status === "winner"));

      const partyTd = document.createElement("td");
      partyTd.textContent = candidate.party;
      row.appendChild(partyTd);

      const votesTd = document.createElement("td");
      votesTd.textContent = formatNumber(candidate.votes);
      row.appendChild(votesTd);

      const pctTd = document.createElement("td");
      pctTd.textContent = formatPercent(candidate.percent);
      row.appendChild(pctTd);

      const statusTd = document.createElement("td");
      statusTd.className = `status-${candidate.status}`;
      statusTd.textContent = statusText;
      row.appendChild(statusTd);

      tbody.appendChild(row);
    });

    noteEl.textContent = roundData.note || "";
    roundsWrap.appendChild(card);
  });

  return roundsWrap;
}

function createFullResultsContent(race) {
  const full = document.createElement("div");
  full.className = "er-full-results";

  const title = document.createElement("h4");
  title.className = "er-full-results-title";
  title.textContent = "Full Race Results";
  full.appendChild(title);
  full.appendChild(renderRounds(race));
  return full;
}

function renderRaceCard(race, updatedAt, jurisdiction) {
  const card = document.createElement("article");
  card.className = "er-race-card";

  const title = document.createElement("h3");
  title.className = "er-race-title";
  title.textContent = race.name;

  const description = document.createElement("p");
  description.className = "er-race-description";
  description.textContent = race.description || "";

  const chipRow = document.createElement("div");
  chipRow.className = "er-chip-row";
  const chips = [`Type: ${deriveRaceTypeLabel(race)}`, `Ballots Cast: ${formatNumber(race.ballotsCast)}`];
  if (race.seats > 1) chips.push(`Seats: ${race.seats}`);
  chips.push(`Rounds: ${race.rounds.length}`);

  chips.forEach((label) => {
    const chip = document.createElement("span");
    chip.className = "er-chip";
    chip.textContent = label;
    chipRow.appendChild(chip);
  });

  const winner = document.createElement("p");
  winner.className = "er-winner-summary";
  winner.textContent = getWinnerSummary(race);

  const summaryTable = renderSummaryTable(race, updatedAt);

  const winnerBanner = renderWinnerBanner(race, jurisdiction);

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "er-toggle-details";

  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "Full results";

  const toggleArrow = document.createElement("span");
  toggleArrow.className = "er-toggle-details-arrow";
  toggleArrow.setAttribute("aria-hidden", "true");
  toggleArrow.textContent = "â–¼";

  toggleButton.append(toggleLabel, toggleArrow);

  const fullResults = createFullResultsContent(race);
  toggleButton.addEventListener("click", () => {
    const isOpen = fullResults.classList.toggle("er-open");
    toggleButton.classList.toggle("open", isOpen);
  });

  if (winnerBanner) {
    card.append(title, description, chipRow, winnerBanner, summaryTable, toggleButton, fullResults);
  } else {
    card.append(title, description, chipRow, winner, summaryTable, toggleButton, fullResults);
  }
  return card;
}

function renderJurisdictionResults() {
  resultsEl.innerHTML = "";
  const jurisdictionGroup = electionData.find((group) => group.jurisdiction === selectedJurisdiction);

  if (!jurisdictionGroup) {
    resultsEl.innerHTML = `<p class="er-empty-state">No results available.</p>`;
    return;
  }

  const heading = document.createElement("h2");
  heading.className = "er-jurisdiction-heading";
  heading.textContent = `${jurisdictionGroup.jurisdiction} Election Results`;
  resultsEl.appendChild(heading);

  jurisdictionGroup.elections.forEach((election) => {
    const section = document.createElement("section");
    section.className = "er-election-group";

    const header = document.createElement("header");
    header.className = "er-election-header";
    header.innerHTML = `
      <h3 class="er-election-title">${election.title}</h3>
      <p class="er-election-meta">Last Updated ${election.updatedAt}</p>
    `;

    const raceStack = document.createElement("div");
    raceStack.className = "er-race-stack";
    election.races.forEach((race) => {
      raceStack.appendChild(renderRaceCard(race, election.updatedAt, jurisdictionGroup.jurisdiction));
    });

    section.append(header, raceStack);
    resultsEl.appendChild(section);
  });
}

function renderLoadError(message) {
  resultsEl.innerHTML = `<p class="er-empty-state">${message}</p>`;
}

function runIntroAnimation() {
  const overlay = document.getElementById("er-intro-overlay");
  if (!overlay) return;

  const logoEl = document.getElementById("er-intro-logo");
  const titleEl = document.getElementById("er-intro-title");
  const canvas = document.getElementById("er-intro-canvas");
  const ctx = canvas.getContext("2d");

  // Build digit elements matching the header logo colours
  const year = String(new Date().getFullYear());
  const digitColors = ["#e34c43", "#2988d8"];
  const digitEls = year.split("").map((char, i) => {
    const span = document.createElement("span");
    span.className = `intro-digit${i % 2 !== 0 ? " from-bottom" : ""}`;
    span.style.background = digitColors[i % 2];
    span.textContent = char;
    logoEl.appendChild(span);
    return span;
  });

  // Resize canvas to fill screen
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Particle fireworks
  let particles = [];
  let rafId = null;

  function spawnBurst(x, y, colors, count = 52) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = 1.8 + Math.random() * 5.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.5,
        alpha: 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.8 + Math.random() * 2.2,
        trail: []
      });
    }
  }

  function tickParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter((p) => p.alpha > 0.02);

    particles.forEach((p) => {
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 5) p.trail.shift();

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.vx *= 0.985;
      p.alpha -= 0.017;

      // Draw trail
      p.trail.forEach((pt, ti) => {
        const trailAlpha = (ti / p.trail.length) * p.alpha * 0.4;
        ctx.globalAlpha = Math.max(0, trailAlpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw head
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    if (particles.length > 0) {
      rafId = requestAnimationFrame(tickParticles);
    }
  }

  // â”€â”€ Sequence â”€â”€
  const stagger = 110;
  const settleEnd = 180 + digitEls.length * stagger;

  // 1. Digits slide in staggered
  digitEls.forEach((el, i) => {
    setTimeout(() => el.classList.add("settled"), 180 + i * stagger);
  });

  // 2. Fireworks burst from logo centre once digits land
  setTimeout(() => {
    const rect = logoEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const fw = [
      { dx: 0,    dy: -10, colors: ["#e34c43", "#ff7f7a", "#ffffff"] },
      { dx: -70,  dy:  20, colors: ["#2988d8", "#7ec8ff", "#ffffff"] },
      { dx:  70,  dy:  20, colors: ["#f5c518", "#ffe066", "#ffffff"] },
      { dx:  30,  dy: -30, colors: ["#e34c43", "#2988d8", "#ffffff"] },
      { dx: -30,  dy: -30, colors: ["#2988d8", "#e34c43", "#ffffff"] },
    ];

    fw.forEach(({ dx, dy, colors }, i) => {
      setTimeout(() => {
        spawnBurst(cx + dx, cy + dy, colors);
        if (rafId) cancelAnimationFrame(rafId);
        tickParticles();
      }, i * 120);
    });
  }, settleEnd + 80);

  // 3. "ELECTIONS" fades in
  setTimeout(() => titleEl.classList.add("visible"), settleEnd + 320);

  // 4. Overlay fades out
  const holdTime = settleEnd + 1600;
  setTimeout(() => {
    overlay.classList.add("fade-out");
    setTimeout(() => {
      overlay.classList.add("gone");
      window.removeEventListener("resize", resizeCanvas);
      if (rafId) cancelAnimationFrame(rafId);
    }, 950);
  }, holdTime);
}

async function init() {
  runIntroAnimation();
  renderYearLogo();

  try {
    const loaded = await loadElectionDataFromJson(DATA_FILE_PATH);
    partyStyles = loaded.partyStyles;
    electionData = loaded.jurisdictions;
    selectedJurisdiction = electionData[0]?.jurisdiction || "";
    renderTabs();
    renderJurisdictionResults();
  } catch (error) {
    console.error(error);
    tabsEl.innerHTML = "";
    renderLoadError(`Unable to load election data from ${DATA_FILE_PATH}.`);
  }
}

init(); })();

