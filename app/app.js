let globalData = [];
let currentSortColumn = 'GAE';
let currentSortDesc = true;
let currentGravityWeight = 0.05; // 5% default (w_prox)
let currentTeamWeight = 0.015;    // 1.5% default (w_team)
let currentSeason = '2025-26';

// Selected players for Versus Mode
let versusPlayerA = null;
let versusPlayerB = null;

// NBA Theme Colors for JS
const nbaBlue = '#1D428A';
const nbaRed = '#C9082A';
const highlightColor = '#F9A01B';
const colorPlayerA = '#00d2d3'; // Cyan / Teal
const colorPlayerB = '#ff9f43'; // Orange / Amber

// Fallback Silhouette Avatar (self-contained SVG data URI)
const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236c757d'><circle cx='12' cy='8' r='4'/><path d='M12 14c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5z'/></svg>";
const DEFAULT_LOGO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%236c757d'><circle cx='12' cy='12' r='10' stroke='%23495057' stroke-width='2' fill='none'/><path d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' fill='none' stroke='%23495057' stroke-width='1.5'/><line x1='2' y1='12' x2='22' y2='12' stroke='%23495057' stroke-width='1.5'/></svg>";

function getPlayerHeadshotUrl(playerId) {
    if (!playerId) return DEFAULT_AVATAR;
    return `https://cdn.nba.com/headshots/nba/latest/260x190/${playerId}.png`;
}

function getTeamLogoUrl(teamAbbr) {
    if (!teamAbbr || teamAbbr === 'N/A') return DEFAULT_LOGO;
    return `https://a.espncdn.com/i/teamlogos/nba/500/${teamAbbr.toLowerCase()}.png`;
}

document.addEventListener('DOMContentLoaded', () => {
    buildTeamMarquees();
    loadSeasonData(currentSeason);
    setupEventListeners();
});


function loadSeasonData(season) {
    currentSeason = season;
    let filePath = `data/gae_data_${season.replace('-', '_')}.json?t=` + new Date().getTime();
    
    fetch(filePath)
        .catch(() => fetch('gae_data.json?t=' + new Date().getTime()))
        .then(response => {
            if (!response.ok) return fetch('gae_data.json?t=' + new Date().getTime());
            return response;
        })
        .then(response => response.json())
        .then(data => {
            globalData = data;

            // ── Rebuild composite Gravity_Index from 4 components ──────────────────
            // Even if the JSON already has a Gravity_Index (single-factor from Python),
            // we recompute it client-side with the richer multi-component formula so
            // the Theory page and actual numbers stay consistent.
            computeCompositeGravityIndex(globalData);

            // Normalize Team_Impact_Index if missing
            if (globalData.length > 0 && typeof globalData[0].Team_Impact_Index === 'undefined') {
                const netRatings = globalData.map(d => d.NET_RATING || 0);
                const meanNet = netRatings.reduce((a, b) => a + b, 0) / netRatings.length;
                const stdNet = Math.sqrt(netRatings.map(x => Math.pow(x - meanNet, 2)).reduce((a, b) => a + b, 0) / netRatings.length) || 1;
                globalData.forEach(d => {
                    d.Team_Impact_Index = ((d.NET_RATING || 0) - meanNet) / stdNet;
                });
            }

            populateFilters(globalData);
            populateVersusDropdowns(globalData);
            recalculateGAE();

            // Initial render
            renderDashboard();
            renderExplorer();
            renderVersusMode();
        })
        .catch(err => console.error("Error loading data:", err));
}

// ── Multi-Component Gravity Index ─────────────────────────────────────────────
// Gravity is NOT just how close the nearest defender stands.
// It is a composite of four behavioural signals that collectively reveal
// how much a defense *distorts itself* to account for a shooter's threat.
//
//  Component              Weight   Signal
//  ─────────────────────  ──────   ──────────────────────────────────────────────
//  Proximity Pressure      60%     Avg closest defender distance (inverted — lower = more gravity)
//  Contest Rate            20%     Share of attempts that are Very Tight or Tight
//  Volume Gravity          12%     Total 3PA — defenses scheme harder against high-volume shooters
//  Pull-Up Rate             8%     Pull-up 3PA share — off-dribble range extends the threat perimeter
//
// Each component is Z-scored across the current season's player pool,
// then combined into a single index. Proximity is inverted (lower dist = higher gravity).
//
function computeCompositeGravityIndex(players) {
    function zScore(values) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const std  = Math.sqrt(values.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / values.length) || 1;
        return { mean, std };
    }

    // 1. Proximity — invert: lower avg distance = higher gravity
    const proxVals   = players.map(d => d.AVG_DEF_DIST || 6.5);
    const proxStats  = zScore(proxVals);

    // 2. Contest Rate — (pct_very_tight + pct_tight) as a fraction 0–1
    const contestVals  = players.map(d => ((d.PCT_VERY_TIGHT || 0) + (d.PCT_TIGHT || 0)));
    const contestStats = zScore(contestVals);

    // 3. Volume — raw FG3A (season attempts)
    const volVals   = players.map(d => d.FG3A || 0);
    const volStats  = zScore(volVals);

    // 4. Pull-Up Rate — pull-up 3PA / total 3PA (ability to create own shot = wider threat radius)
    const pullVals  = players.map(d => d.FG3A > 0 ? (d.PULL_UP_FG3A || 0) / d.FG3A : 0);
    const pullStats = zScore(pullVals);

    players.forEach((d, i) => {
        // Proximity: inverted z-score (below-average distance → positive gravity)
        const zProx    = -((proxVals[i]    - proxStats.mean)    / proxStats.std);
        const zContest =  (contestVals[i]  - contestStats.mean) / contestStats.std;
        const zVol     =  (volVals[i]      - volStats.mean)     / volStats.std;
        const zPull    =  (pullVals[i]     - pullStats.mean)     / pullStats.std;

        // Store raw component scores for potential display
        d.GI_Proximity = zProx;
        d.GI_Contest   = zContest;
        d.GI_Volume    = zVol;
        d.GI_PullUp    = zPull;

        // Composite: weighted sum
        d.Gravity_Index = 0.60 * zProx + 0.20 * zContest + 0.12 * zVol + 0.08 * zPull;
    });
}



function recalculateGAE(wProx = currentGravityWeight, wTeam = currentTeamWeight) {
    currentGravityWeight = wProx;
    currentTeamWeight = wTeam;
    
    globalData.forEach(d => {
        const proxFactor = (d.Gravity_Index || 0) * currentGravityWeight;
        const teamFactor = (d.Team_Impact_Index || 0) * currentTeamWeight;
        d.GAE = d.FG3_PCT * (1 + proxFactor + teamFactor);
        d.GAE_DIFF = d.GAE - d.FG3_PCT;
    });

    updateMetricTunerUI();
}

function updateMetricTunerUI() {
    const proxPct = Math.round(currentGravityWeight * 100);
    const teamPct = (currentTeamWeight * 100).toFixed(1);

    // Badges
    const badgeProx = document.getElementById('gravityWeightBadge');
    if (badgeProx) badgeProx.innerText = `${proxPct}%`;

    const badgeTeam = document.getElementById('teamWeightBadge');
    if (badgeTeam) badgeTeam.innerText = `${teamPct}%`;

    const badgeExp = document.getElementById('gravityWeightExpValue');
    if (badgeExp) badgeExp.innerText = `${proxPct}%`;

    // Sliders
    const sliderDash = document.getElementById('gravitySliderDash');
    if (sliderDash && parseInt(sliderDash.value, 10) !== proxPct) sliderDash.value = proxPct;

    const sliderTeam = document.getElementById('teamSliderDash');
    if (sliderTeam) {
        const teamSliderVal = Math.round(currentTeamWeight * 1000);
        if (parseInt(sliderTeam.value, 10) !== teamSliderVal) sliderTeam.value = teamSliderVal;
    }

    const sliderExp = document.getElementById('gravitySliderExp');
    if (sliderExp && parseInt(sliderExp.value, 10) !== proxPct) sliderExp.value = proxPct;

    // Formula preview
    const formulaCode = document.getElementById('formulaCode');
    if (formulaCode) {
        formulaCode.innerHTML = `GAE = 3P% &times; [1 + (Gravity &times; ${currentGravityWeight.toFixed(2)}) + (Team Impact &times; ${currentTeamWeight.toFixed(3)})]`;
    }

    // Impact Cards (Top Gainer and Biggest Dropper)
    if (globalData.length > 0) {
        const sorted = [...globalData].sort((a, b) => b.GAE_DIFF - a.GAE_DIFF);
        const top = sorted[0];
        const bottom = sorted[sorted.length - 1];

        if (top) {
            const topImg = document.getElementById('topRiserImg');
            if (topImg) {
                topImg.src = getPlayerHeadshotUrl(top.PLAYER_ID);
                topImg.onerror = function() { this.src = DEFAULT_AVATAR; };
            }
            const topLogo = document.getElementById('topRiserTeamLogo');
            if (topLogo) {
                topLogo.src = getTeamLogoUrl(top.TEAM_ABBREVIATION);
                topLogo.onerror = function() { this.src = DEFAULT_LOGO; };
            }
            const topName = document.getElementById('topRiserName');
            if (topName) topName.innerText = `${top.PLAYER_NAME} (${top.TEAM_ABBREVIATION || 'N/A'})`;
            const top3P = document.getElementById('topRiser3P');
            if (top3P) top3P.innerText = `3P%: ${(top.FG3_PCT * 100).toFixed(1)}%`;
            const topGAE = document.getElementById('topRiserGAE');
            if (topGAE) topGAE.innerText = `GAE: ${(top.GAE * 100).toFixed(1)}%`;
            const topDiff = document.getElementById('topRiserDiff');
            if (topDiff) {
                const diffPct = (top.GAE_DIFF * 100).toFixed(1);
                topDiff.innerText = `${diffPct >= 0 ? '+' : ''}${diffPct}%`;
            }
        }

        if (bottom) {
            const botImg = document.getElementById('biggestDropImg');
            if (botImg) {
                botImg.src = getPlayerHeadshotUrl(bottom.PLAYER_ID);
                botImg.onerror = function() { this.src = DEFAULT_AVATAR; };
            }
            const botLogo = document.getElementById('biggestDropTeamLogo');
            if (botLogo) {
                botLogo.src = getTeamLogoUrl(bottom.TEAM_ABBREVIATION);
                botLogo.onerror = function() { this.src = DEFAULT_LOGO; };
            }
            const botName = document.getElementById('biggestDropName');
            if (botName) botName.innerText = `${bottom.PLAYER_NAME} (${bottom.TEAM_ABBREVIATION || 'N/A'})`;
            const bot3P = document.getElementById('biggestDrop3P');
            if (bot3P) bot3P.innerText = `3P%: ${(bottom.FG3_PCT * 100).toFixed(1)}%`;
            const botGAE = document.getElementById('biggestDropGAE');
            if (botGAE) botGAE.innerText = `GAE: ${(bottom.GAE * 100).toFixed(1)}%`;
            const botDiff = document.getElementById('biggestDropDiff');
            if (botDiff) {
                const diffPct = (bottom.GAE_DIFF * 100).toFixed(1);
                botDiff.innerText = `${diffPct >= 0 ? '+' : ''}${diffPct}%`;
            }
        }
    }
}

// ── Welcome Screen: Scrolling Team Logo Marquees ─────────────────────────────
function buildTeamMarquees() {
    // All 30 NBA teams: { abbr for ESPN logo, id for NBA CDN, display abbr }
    const NBA_TEAMS = [
        { abbr: 'atl', name: 'ATL', id: 1610612737 },
        { abbr: 'bos', name: 'BOS', id: 1610612738 },
        { abbr: 'bkn', name: 'BKN', id: 1610612751 },
        { abbr: 'cha', name: 'CHA', id: 1610612766 },
        { abbr: 'chi', name: 'CHI', id: 1610612741 },
        { abbr: 'cle', name: 'CLE', id: 1610612739 },
        { abbr: 'dal', name: 'DAL', id: 1610612742 },
        { abbr: 'den', name: 'DEN', id: 1610612743 },
        { abbr: 'det', name: 'DET', id: 1610612765 },
        { abbr: 'gsw', name: 'GSW', id: 1610612744 },
        { abbr: 'hou', name: 'HOU', id: 1610612745 },
        { abbr: 'ind', name: 'IND', id: 1610612754 },
        { abbr: 'lac', name: 'LAC', id: 1610612746 },
        { abbr: 'lal', name: 'LAL', id: 1610612747 },
        { abbr: 'mem', name: 'MEM', id: 1610612763 },
        { abbr: 'mia', name: 'MIA', id: 1610612748 },
        { abbr: 'mil', name: 'MIL', id: 1610612749 },
        { abbr: 'min', name: 'MIN', id: 1610612750 },
        { abbr: 'nop', name: 'NOP', id: 1610612740 },
        { abbr: 'nyk', name: 'NYK', id: 1610612752 },
        { abbr: 'okc', name: 'OKC', id: 1610612760 },
        { abbr: 'orl', name: 'ORL', id: 1610612753 },
        { abbr: 'phi', name: 'PHI', id: 1610612755 },
        { abbr: 'phx', name: 'PHX', id: 1610612756 },
        { abbr: 'por', name: 'POR', id: 1610612757 },
        { abbr: 'sac', name: 'SAC', id: 1610612758 },
        { abbr: 'sas', name: 'SAS', id: 1610612759 },
        { abbr: 'tor', name: 'TOR', id: 1610612761 },
        { abbr: 'uta', name: 'UTA', id: 1610612762 },
        { abbr: 'was', name: 'WAS', id: 1610612764 }
    ];

    function makeBadge(team) {
        const wrap = document.createElement('div');
        wrap.className = 'team-logo-badge';

        const img = document.createElement('img');
        // Primary: NBA CDN (official, widely used by stats sites)
        img.src = `https://cdn.nba.com/logos/nba/${team.id}/primary/L/logo.svg`;
        img.alt = team.name;
        img.loading = 'lazy';
        img.onerror = function () {
            // Fallback: ESPN logo CDN
            if (!this._espnTried) {
                this._espnTried = true;
                this.src = `https://a.espncdn.com/i/teamlogos/nba/500/${team.abbr}.png`;
            } else {
                // Final fallback: text abbreviation pill
                this.replaceWith(Object.assign(document.createElement('span'), {
                    className: 'team-abbr-pill',
                    textContent: team.name
                }));
            }
        };

        const label = document.createElement('span');
        label.textContent = team.name;

        wrap.appendChild(img);
        wrap.appendChild(label);
        return wrap;
    }

    // Row 1: teams 0-14 (first half) — scrolls left
    const row1 = document.getElementById('marqueeRow1');
    // Row 2: teams 15-29 (second half) — scrolls right
    const row2 = document.getElementById('marqueeRow2');

    if (!row1 || !row2) return;

    // Each row is duplicated to create a seamless infinite loop
    const half1 = NBA_TEAMS.slice(0, 15);
    const half2 = NBA_TEAMS.slice(15);

    [...half1, ...half1].forEach(t => row1.appendChild(makeBadge(t)));
    [...half2, ...half2].forEach(t => row2.appendChild(makeBadge(t)));
}

function setupEventListeners() {

    // Welcome / Starting Screen Enter Button
    const enterBtn = document.getElementById('enterAppBtn');
    if (enterBtn) {
        enterBtn.addEventListener('click', () => {
            const welcome = document.getElementById('welcomeScreen');
            if (welcome) {
                welcome.classList.add('fade-out');
                setTimeout(() => {
                    welcome.classList.add('hidden');
                }, 500);
            }
        });
    }

    // Logo Click to Return to Starting Screen
    const navLogo = document.getElementById('navLogo');
    if (navLogo) {
        navLogo.addEventListener('click', () => {
            const welcome = document.getElementById('welcomeScreen');
            if (welcome) {
                welcome.classList.remove('hidden');
                void welcome.offsetWidth;
                welcome.classList.remove('fade-out');
            }
        });
    }

    // Nav Tabs Logic
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
            
            const targetId = tab.getAttribute('data-target');
            const targetView = document.getElementById(targetId);
            if (targetView) targetView.classList.remove('hidden');

            if (targetId === 'dashboard-view') renderDashboard();
            if (targetId === 'explorer-view') renderExplorer();
            if (targetId === 'versus-view') renderVersusMode();
        });
    });

    // Season Selector
    const seasonSelect = document.getElementById('seasonSelect');
    if (seasonSelect) {
        seasonSelect.addEventListener('change', (e) => {
            loadSeasonData(e.target.value);
        });
    }

    // Sliders: Proximity Gravity
    const sliderDash = document.getElementById('gravitySliderDash');
    if (sliderDash) {
        sliderDash.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) / 100;
            recalculateGAE(val, currentTeamWeight);
            renderDashboard();
            renderExplorer();
            renderVersusMode();
        });
    }

    // Sliders: Team Impact (step = 0.005)
    const sliderTeam = document.getElementById('teamSliderDash');
    if (sliderTeam) {
        sliderTeam.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) / 1000;
            recalculateGAE(currentGravityWeight, val);
            renderDashboard();
            renderExplorer();
            renderVersusMode();
        });
    }

    // Explorer synced slider
    const sliderExp = document.getElementById('gravitySliderExp');
    if (sliderExp) {
        sliderExp.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value) / 100;
            recalculateGAE(val, currentTeamWeight);
            renderDashboard();
            renderExplorer();
            renderVersusMode();
        });
    }

    // Preset Buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const prox = parseFloat(btn.getAttribute('data-prox') || btn.getAttribute('data-weight') || '5') / 100;
            const team = parseFloat(btn.getAttribute('data-team') || '15') / 1000;
            
            recalculateGAE(prox, team);
            renderDashboard();
            renderExplorer();
            renderVersusMode();
        });
    });

    // Versus Dropdowns
    const selectA = document.getElementById('versusPlayerA');
    if (selectA) {
        selectA.addEventListener('change', (e) => {
            const player = globalData.find(d => String(d.PLAYER_ID) === e.target.value);
            if (player) {
                versusPlayerA = player;
                renderVersusMode();
            }
        });
    }

    const selectB = document.getElementById('versusPlayerB');
    if (selectB) {
        selectB.addEventListener('change', (e) => {
            const player = globalData.find(d => String(d.PLAYER_ID) === e.target.value);
            if (player) {
                versusPlayerB = player;
                renderVersusMode();
            }
        });
    }

    // Quick Matchup Buttons
    document.querySelectorAll('.matchup-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const nameA = btn.getAttribute('data-a');
            const nameB = btn.getAttribute('data-b');
            const pA = globalData.find(d => d.PLAYER_NAME.toLowerCase().includes(nameA.toLowerCase()));
            const pB = globalData.find(d => d.PLAYER_NAME.toLowerCase().includes(nameB.toLowerCase()));

            if (pA) {
                versusPlayerA = pA;
                if (selectA) selectA.value = String(pA.PLAYER_ID);
            }
            if (pB) {
                versusPlayerB = pB;
                if (selectB) selectB.value = String(pB.PLAYER_ID);
            }
            renderVersusMode();
        });
    });

    // Dashboard Search
    const searchInputDash = document.getElementById('playerSearchDash');
    document.getElementById('searchBtnDash').addEventListener('click', renderDashboard);
    searchInputDash.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') renderDashboard();
    });
    document.getElementById('resetBtnDash').addEventListener('click', () => {
        searchInputDash.value = '';
        renderDashboard();
    });

    // Explorer Filters & Search
    const searchInputExp = document.getElementById('playerSearchExp');
    document.getElementById('searchBtnExp').addEventListener('click', renderExplorer);
    searchInputExp.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') renderExplorer();
    });
    document.getElementById('resetBtnExp').addEventListener('click', () => {
        searchInputExp.value = '';
        document.getElementById('min3pa').value = 100;
        document.getElementById('min3paValue').innerText = '100';
        document.getElementById('teamFilter').value = 'All';
        document.getElementById('positionFilter').value = 'All';
        renderExplorer();
    });

    document.getElementById('min3pa').addEventListener('input', (e) => {
        document.getElementById('min3paValue').innerText = e.target.value;
        renderExplorer();
    });
    document.getElementById('teamFilter').addEventListener('change', renderExplorer);
    document.getElementById('positionFilter').addEventListener('change', renderExplorer);

    // Modal Close
    document.getElementById('closeModalBtn').addEventListener('click', () => {
        document.getElementById('playerModal').classList.add('hidden');
    });

    // Table Sorting
    document.querySelectorAll('#leaderboardTable th').forEach(th => {
        th.addEventListener('click', () => {
            const column = th.getAttribute('data-sort');
            if (currentSortColumn === column) {
                currentSortDesc = !currentSortDesc;
            } else {
                currentSortColumn = column;
                currentSortDesc = true;
            }
            
            document.querySelectorAll('#leaderboardTable th').forEach(h => h.classList.remove('sort-active'));
            th.classList.add('sort-active');
            
            renderExplorer();
        });
    });
}

function populateFilters(data) {
    const teams = new Set();
    data.forEach(d => {
        if (d.TEAM_ABBREVIATION && d.TEAM_ABBREVIATION !== 'N/A') {
            teams.add(d.TEAM_ABBREVIATION);
        }
    });
    
    const teamSelect = document.getElementById('teamFilter');
    if (teamSelect) {
        teamSelect.innerHTML = '<option value="All">All Teams</option>';
        Array.from(teams).sort().forEach(team => {
            const option = document.createElement('option');
            option.value = team;
            option.textContent = team;
            teamSelect.appendChild(option);
        });
    }
}

function populateVersusDropdowns(data) {
    const selectA = document.getElementById('versusPlayerA');
    const selectB = document.getElementById('versusPlayerB');
    if (!selectA || !selectB) return;

    selectA.innerHTML = '';
    selectB.innerHTML = '';

    const sortedPlayers = [...data].sort((a, b) => a.PLAYER_NAME.localeCompare(b.PLAYER_NAME));
    sortedPlayers.forEach(p => {
        const optA = document.createElement('option');
        optA.value = p.PLAYER_ID;
        optA.textContent = `${p.PLAYER_NAME} (${p.TEAM_ABBREVIATION || 'N/A'})`;
        selectA.appendChild(optA);

        const optB = document.createElement('option');
        optB.value = p.PLAYER_ID;
        optB.textContent = `${p.PLAYER_NAME} (${p.TEAM_ABBREVIATION || 'N/A'})`;
        selectB.appendChild(optB);
    });

    // Select defaults: Steph Curry vs Luka Dončić or top players
    const steph = sortedPlayers.find(p => p.PLAYER_NAME.includes('Stephen Curry')) || sortedPlayers[0];
    const luka = sortedPlayers.find(p => p.PLAYER_NAME.includes('Luka')) || sortedPlayers[Math.min(1, sortedPlayers.length - 1)];

    versusPlayerA = steph;
    versusPlayerB = luka;

    selectA.value = String(steph.PLAYER_ID);
    selectB.value = String(luka.PLAYER_ID);
}

function getMarkerSettings(searchTerm, isMatch, defaultColor) {
    if (searchTerm === '') return { color: defaultColor, opacity: 0.7, size: 10, line: {color: 'white', width: 1} };
    if (isMatch) return { color: highlightColor, opacity: 1.0, size: 16, line: {color: 'white', width: 2} };
    return { color: 'rgba(100, 100, 100, 0.2)', opacity: 0.2, size: 8, line: {color: 'transparent', width: 0} };
}

const commonLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { color: '#F8F9FA' },
    margin: { t: 20, l: 50, r: 20, b: 50 },
    showlegend: false,
    hovermode: 'closest'
};

// --- DASHBOARD RENDER LOGIC ---
function renderDashboard() {
    if (globalData.length === 0) return;
    
    const searchTerm = document.getElementById('playerSearchDash').value.toLowerCase().trim();
    
    buildGaePlot(globalData, searchTerm, 'gaeScatterPlot-dash');
    buildProximityPlot(globalData, searchTerm, 'proximityScatterPlot-dash');
    buildDumbbellPlot(globalData, searchTerm, 'dumbbellPlot-dash');
    
    document.getElementById('gaeScatterPlot-dash').on('plotly_click', handlePlotClick);
    document.getElementById('proximityScatterPlot-dash').on('plotly_click', handlePlotClick);
    document.getElementById('dumbbellPlot-dash').on('plotly_click', handlePlotClick);
}

// --- EXPLORER RENDER LOGIC ---
function renderExplorer() {
    if (globalData.length === 0) return;

    const min3PA = parseInt(document.getElementById('min3pa').value, 10);
    const team = document.getElementById('teamFilter').value;
    const position = document.getElementById('positionFilter').value;
    const searchTerm = document.getElementById('playerSearchExp').value.toLowerCase().trim();

    let filteredData = globalData.filter(d => {
        if (d.FG3A < min3PA) return false;
        if (team !== 'All' && d.TEAM_ABBREVIATION !== team) return false;
        if (position !== 'All') {
            if (!d.POSITION || !d.POSITION.includes(position)) return false;
        }
        return true;
    });

    if (filteredData.length === 0) {
        document.getElementById('gaeScatterPlot-exp').innerHTML = '<p style="text-align:center; padding: 2rem;">No data matches the current filters.</p>';
        document.getElementById('proximityScatterPlot-exp').innerHTML = '<p style="text-align:center; padding: 2rem;">No data matches the current filters.</p>';
        document.getElementById('leaderboardBody').innerHTML = '<tr><td colspan="9" style="text-align:center;">No data matches</td></tr>';
        return;
    }

    buildGaePlot(filteredData, searchTerm, 'gaeScatterPlot-exp');
    buildProximityPlot(filteredData, searchTerm, 'proximityScatterPlot-exp');
    
    document.getElementById('gaeScatterPlot-exp').on('plotly_click', handlePlotClick);
    document.getElementById('proximityScatterPlot-exp').on('plotly_click', handlePlotClick);

    renderTable(filteredData, searchTerm);
}

// --- VERSUS MODE RENDER LOGIC ---
function renderVersusMode() {
    if (!versusPlayerA || !versusPlayerB) return;

    // Refresh player objects from latest globalData (with fresh recalculated GAE)
    versusPlayerA = globalData.find(d => d.PLAYER_ID === versusPlayerA.PLAYER_ID) || versusPlayerA;
    versusPlayerB = globalData.find(d => d.PLAYER_ID === versusPlayerB.PLAYER_ID) || versusPlayerB;

    // Render Cards
    renderVersusCard(versusPlayerA, 'A');
    renderVersusCard(versusPlayerB, 'B');

    // Render Charts
    buildVersusRadarPlot(versusPlayerA, versusPlayerB);
    buildVersusProximityPlot(versusPlayerA, versusPlayerB);
    buildVersusZonePlot(versusPlayerA, versusPlayerB);

    // Render Table
    renderVersusTable(versusPlayerA, versusPlayerB);
}

function renderVersusCard(player, side) {
    const img = document.getElementById(`versusImg${side}`);
    if (img) {
        img.src = getPlayerHeadshotUrl(player.PLAYER_ID);
        img.onerror = function() { this.src = DEFAULT_AVATAR; };
    }
    const logo = document.getElementById(`versusTeamLogo${side}`);
    if (logo) {
        logo.src = getTeamLogoUrl(player.TEAM_ABBREVIATION);
        logo.onerror = function() { this.src = DEFAULT_LOGO; };
    }
    const name = document.getElementById(`versusName${side}`);
    if (name) name.innerText = player.PLAYER_NAME;

    const teamPos = document.getElementById(`versusTeamPos${side}`);
    if (teamPos) teamPos.innerText = `${player.TEAM_ABBREVIATION || 'N/A'} | ${player.POSITION || 'N/A'}`;

    const gravBadge = document.getElementById(`versusGravityBadge${side}`);
    if (gravBadge) {
        const g = player.Gravity_Index || 0;
        gravBadge.innerText = `${g >= 0 ? '+' : ''}${g.toFixed(2)} Gravity`;
        gravBadge.style.color = g >= 0 ? '#52C47D' : '#ff6b81';
    }

    const gae = document.getElementById(`versusGae${side}`);
    if (gae) gae.innerText = `${(player.GAE * 100).toFixed(1)}%`;

    const gaeShift = document.getElementById(`versusGaeShift${side}`);
    if (gaeShift) {
        const diff = (player.GAE_DIFF * 100).toFixed(1);
        gaeShift.innerText = `${diff >= 0 ? '+' : ''}${diff}% shift`;
        gaeShift.style.color = diff >= 0 ? '#52C47D' : '#ff6b81';
    }

    const raw3p = document.getElementById(`versus3p${side}`);
    if (raw3p) raw3p.innerText = `${(player.FG3_PCT * 100).toFixed(1)}%`;

    const net = document.getElementById(`versusNet${side}`);
    if (net) {
        const netVal = (player.NET_RATING || 0).toFixed(1);
        net.innerText = `${netVal >= 0 ? '+' : ''}${netVal}`;
        net.style.color = netVal >= 0 ? '#52C47D' : '#ff6b81';
    }
}

function buildVersusRadarPlot(pA, pB) {
    // 6 Metrics normalized to percentile (0 to 100)
    function getPercentile(val, key) {
        const allVals = globalData.map(d => d[key] || 0).sort((a, b) => a - b);
        const rank = allVals.findIndex(x => x >= val);
        return rank === -1 ? 100 : Math.round((rank / allVals.length) * 100);
    }

    // For defender distance, lower distance means tighter pressure, so invert percentile
    function getClosenessPercentile(val) {
        const allVals = globalData.map(d => d.AVG_DEF_DIST || 6.5).sort((a, b) => b - a); // descending
        const rank = allVals.findIndex(x => x <= val);
        return rank === -1 ? 100 : Math.round((rank / allVals.length) * 100);
    }

    const categories = [
        'Gravity Index',
        'Pure 3P%',
        '3PA Volume',
        'Contested Closeness',
        'Catch & Shoot %',
        'Team Net Impact'
    ];

    const valsA = [
        getPercentile(pA.Gravity_Index, 'Gravity_Index'),
        getPercentile(pA.FG3_PCT, 'FG3_PCT'),
        getPercentile(pA.FG3A, 'FG3A'),
        getClosenessPercentile(pA.AVG_DEF_DIST),
        getPercentile(pA.CATCH_SHOOT_FG3_PCT, 'CATCH_SHOOT_FG3_PCT'),
        getPercentile(pA.NET_RATING || 0, 'NET_RATING')
    ];

    const valsB = [
        getPercentile(pB.Gravity_Index, 'Gravity_Index'),
        getPercentile(pB.FG3_PCT, 'FG3_PCT'),
        getPercentile(pB.FG3A, 'FG3A'),
        getClosenessPercentile(pB.AVG_DEF_DIST),
        getPercentile(pB.CATCH_SHOOT_FG3_PCT, 'CATCH_SHOOT_FG3_PCT'),
        getPercentile(pB.NET_RATING || 0, 'NET_RATING')
    ];

    // Close the polygon
    categories.push(categories[0]);
    valsA.push(valsA[0]);
    valsB.push(valsB[0]);

    const traceA = {
        type: 'scatterpolar',
        r: valsA,
        theta: categories,
        fill: 'toself',
        name: pA.PLAYER_NAME,
        line: { color: colorPlayerA, width: 2 },
        fillcolor: 'rgba(0, 210, 211, 0.25)'
    };

    const traceB = {
        type: 'scatterpolar',
        r: valsB,
        theta: categories,
        fill: 'toself',
        name: pB.PLAYER_NAME,
        line: { color: colorPlayerB, width: 2 },
        fillcolor: 'rgba(255, 159, 67, 0.25)'
    };

    const layout = {
        ...commonLayout,
        polar: {
            radialaxis: {
                visible: true,
                range: [0, 100],
                tickfont: { size: 9, color: 'rgba(255,255,255,0.4)' },
                gridcolor: 'rgba(255,255,255,0.1)'
            },
            angularaxis: {
                tickfont: { size: 11, color: '#F8F9FA' },
                gridcolor: 'rgba(255,255,255,0.1)'
            },
            bgcolor: 'transparent'
        },
        showlegend: true,
        legend: { x: 0.5, y: -0.15, xanchor: 'center', orientation: 'h' },
        margin: { t: 30, b: 50, l: 50, r: 50 }
    };

    Plotly.newPlot('versusRadarPlot', [traceA, traceB], layout, {responsive: true});
}

function buildVersusProximityPlot(pA, pB) {
    const buckets = ['Very Tight (0-2 ft)', 'Tight (2-4 ft)', 'Open (4-6 ft)', 'Wide Open (6+ ft)'];
    const sharesA = [
        pA.PCT_VERY_TIGHT || 0,
        pA.PCT_TIGHT || 0,
        pA.PCT_OPEN || 0,
        pA.PCT_WIDE_OPEN || 0
    ];
    const sharesB = [
        pB.PCT_VERY_TIGHT || 0,
        pB.PCT_TIGHT || 0,
        pB.PCT_OPEN || 0,
        pB.PCT_WIDE_OPEN || 0
    ];

    const traceA = {
        x: buckets,
        y: sharesA,
        name: pA.PLAYER_NAME,
        type: 'bar',
        marker: { color: colorPlayerA },
        text: sharesA.map(v => `${v.toFixed(1)}%`),
        textposition: 'auto'
    };

    const traceB = {
        x: buckets,
        y: sharesB,
        name: pB.PLAYER_NAME,
        type: 'bar',
        marker: { color: colorPlayerB },
        text: sharesB.map(v => `${v.toFixed(1)}%`),
        textposition: 'auto'
    };

    const layout = {
        ...commonLayout,
        barmode: 'group',
        xaxis: { gridcolor: 'rgba(255,255,255,0.1)', tickfont: { size: 11 } },
        yaxis: { title: '% of Total 3PA', gridcolor: 'rgba(255,255,255,0.1)' },
        showlegend: true,
        legend: { x: 0.5, y: -0.2, xanchor: 'center', orientation: 'h' }
    };

    Plotly.newPlot('versusProximityPlot', [traceA, traceB], layout, {responsive: true});
}

function buildVersusZonePlot(pA, pB) {
    const zones = [
        'Left Corner 3',
        'Right Corner 3',
        'Above the Break 3',
        'Mid-Range',
        'Paint & Restricted'
    ];

    // FGA Volume
    const fgaA = [
        pA.ZONE_LC3_FGA || 0,
        pA.ZONE_RC3_FGA || 0,
        pA.ZONE_AB3_FGA || 0,
        pA.ZONE_MID_FGA || 0,
        (pA.ZONE_RA_FGA || 0) + (pA.ZONE_PAINT_FGA || 0)
    ];

    const fgaB = [
        pB.ZONE_LC3_FGA || 0,
        pB.ZONE_RC3_FGA || 0,
        pB.ZONE_AB3_FGA || 0,
        pB.ZONE_MID_FGA || 0,
        (pB.ZONE_RA_FGA || 0) + (pB.ZONE_PAINT_FGA || 0)
    ];

    // Accuracy FG%
    const pctA = [
        (pA.ZONE_LC3_PCT || 0) * 100,
        (pA.ZONE_RC3_PCT || 0) * 100,
        (pA.ZONE_AB3_PCT || 0) * 100,
        (pA.ZONE_MID_PCT || 0) * 100,
        pA.ZONE_RA_PCT ? pA.ZONE_RA_PCT * 100 : 50
    ];

    const pctB = [
        (pB.ZONE_LC3_PCT || 0) * 100,
        (pB.ZONE_RC3_PCT || 0) * 100,
        (pB.ZONE_AB3_PCT || 0) * 100,
        (pB.ZONE_MID_PCT || 0) * 100,
        pB.ZONE_RA_PCT ? pB.ZONE_RA_PCT * 100 : 50
    ];

    const traceA = {
        x: zones,
        y: fgaA,
        name: `${pA.PLAYER_NAME} (FGA)`,
        type: 'bar',
        marker: { color: colorPlayerA },
        text: pctA.map((pct, i) => `${fgaA[i]} FGA (${pct.toFixed(0)}%)`),
        textposition: 'auto'
    };

    const traceB = {
        x: zones,
        y: fgaB,
        name: `${pB.PLAYER_NAME} (FGA)`,
        type: 'bar',
        marker: { color: colorPlayerB },
        text: pctB.map((pct, i) => `${fgaB[i]} FGA (${pct.toFixed(0)}%)`),
        textposition: 'auto'
    };

    const layout = {
        ...commonLayout,
        barmode: 'group',
        xaxis: { gridcolor: 'rgba(255,255,255,0.1)', tickfont: { size: 11 } },
        yaxis: { title: 'Shot Attempts (FGA) · Text shows Zone FG%', gridcolor: 'rgba(255,255,255,0.1)' },
        showlegend: true,
        legend: { x: 0.5, y: -0.2, xanchor: 'center', orientation: 'h' }
    };

    Plotly.newPlot('versusZonePlot', [traceA, traceB], layout, {responsive: true});
}

function renderVersusTable(pA, pB) {
    const tbody = document.getElementById('versusTableBody');
    if (!tbody) return;

    document.getElementById('thPlayerA').innerText = pA.PLAYER_NAME;
    document.getElementById('thPlayerB').innerText = pB.PLAYER_NAME;

    const metrics = [
        { label: 'GAE (Dynamic Metric)', valA: pA.GAE, valB: pB.GAE, fmt: v => `${(v * 100).toFixed(1)}%`, higherBetter: true },
        { label: 'Standard Overall 3P%', valA: pA.FG3_PCT, valB: pB.FG3_PCT, fmt: v => `${(v * 100).toFixed(1)}%`, higherBetter: true },
        { label: 'GAE Shift (Value Created)', valA: pA.GAE_DIFF, valB: pB.GAE_DIFF, fmt: v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`, higherBetter: true },
        { label: 'Gravity Index (Z-Score)', valA: pA.Gravity_Index, valB: pB.Gravity_Index, fmt: v => (v || 0).toFixed(2), higherBetter: true },
        { label: 'Avg Defender Distance', valA: pA.AVG_DEF_DIST, valB: pB.AVG_DEF_DIST, fmt: v => `${(v || 0).toFixed(2)} ft`, higherBetter: false },
        { label: 'Total 3PA Volume', valA: pA.FG3A, valB: pB.FG3A, fmt: v => v, higherBetter: true },
        { label: 'Catch & Shoot 3P%', valA: pA.CATCH_SHOOT_FG3_PCT, valB: pB.CATCH_SHOOT_FG3_PCT, fmt: v => `${((v || 0) * 100).toFixed(1)}%`, higherBetter: true },
        { label: 'Pull-Up 3P%', valA: pA.PULL_UP_FG3_PCT || 0, valB: pB.PULL_UP_FG3_PCT || 0, fmt: v => `${((v || 0) * 100).toFixed(1)}%`, higherBetter: true },
        { label: 'On-Court Net Rating', valA: pA.NET_RATING || 0, valB: pB.NET_RATING || 0, fmt: v => `${v >= 0 ? '+' : ''}${(v || 0).toFixed(1)}`, higherBetter: true },
        { label: 'On-Court Offensive Rating', valA: pA.OFF_RATING || 100, valB: pB.OFF_RATING || 100, fmt: v => (v || 100).toFixed(1), higherBetter: true },
        { label: 'Team Win Percentage', valA: pA.W_PCT || 0.5, valB: pB.W_PCT || 0.5, fmt: v => `${((v || 0) * 100).toFixed(1)}%`, higherBetter: true }
    ];

    tbody.innerHTML = '';
    metrics.forEach(m => {
        const tr = document.createElement('tr');
        
        let aWins = false;
        let bWins = false;
        if (m.valA !== m.valB) {
            if (m.higherBetter) {
                aWins = m.valA > m.valB;
                bWins = m.valB > m.valA;
            } else {
                aWins = m.valA < m.valB;
                bWins = m.valB < m.valA;
            }
        }

        tr.innerHTML = `
            <td class="cell-val-a">
                <span class="${aWins ? 'cell-win' : ''}">${m.fmt(m.valA)} ${aWins ? '✓' : ''}</span>
            </td>
            <td class="versus-metric-name">${m.label}</td>
            <td class="cell-val-b">
                <span class="${bWins ? 'cell-win' : ''}">${bWins ? '✓ ' : ''}${m.fmt(m.valB)}</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- PLOT BUILDERS ---
function buildGaePlot(data, searchTerm, containerId) {
    const gaeMarkerColors = [];
    const gaeMarkerSizes = [];
    const gaeMarkerOpacities = [];
    const gaeMarkerLines = [];
    const gaeMarkerLineColors = [];

    data.forEach(d => {
        const isMatch = searchTerm !== '' && d.PLAYER_NAME.toLowerCase().includes(searchTerm);
        let settings = getMarkerSettings(searchTerm, isMatch, nbaBlue);
        gaeMarkerColors.push(settings.color);
        gaeMarkerSizes.push(settings.size);
        gaeMarkerOpacities.push(settings.opacity);
        gaeMarkerLines.push(settings.line.width);
        gaeMarkerLineColors.push(settings.line.color);
    });

    const trace = {
        x: data.map(d => d.FG3_PCT * 100),
        y: data.map(d => d.GAE * 100),
        customdata: data,
        mode: 'markers',
        type: 'scatter',
        text: data.map(d => `<b>${d.PLAYER_NAME}</b><br>Standard 3P%: ${(d.FG3_PCT*100).toFixed(1)}%<br>GAE: ${(d.GAE*100).toFixed(1)}%<br>Shift: ${(d.GAE_DIFF*100 >= 0 ? '+' : '')}${(d.GAE_DIFF*100).toFixed(1)}%`),
        hoverinfo: 'text',
        marker: { size: gaeMarkerSizes, color: gaeMarkerColors, opacity: gaeMarkerOpacities, line: { width: gaeMarkerLines, color: gaeMarkerLineColors } }
    };

    const maxVal = Math.max(...data.map(d => d.FG3_PCT * 100), ...data.map(d => d.GAE * 100));
    const minVal = Math.min(...data.map(d => d.FG3_PCT * 100), ...data.map(d => d.GAE * 100));
    const lineTrace = { x: [minVal, maxVal], y: [minVal, maxVal], mode: 'lines', type: 'scatter', line: { dash: 'dash', color: 'rgba(255,255,255,0.3)' }, hoverinfo: 'none' };

    let layout = {...commonLayout, xaxis: { title: 'Standard Overall 3P% (%)', gridcolor: 'rgba(255,255,255,0.1)' }, yaxis: { title: `GAE (${Math.round(currentGravityWeight * 100)}% Prox + ${(currentTeamWeight * 100).toFixed(1)}% Team) (%)`, gridcolor: 'rgba(255,255,255,0.1)' }};
    Plotly.newPlot(containerId, [trace, lineTrace], layout, {responsive: true});
}

function buildProximityPlot(data, searchTerm, containerId) {
    const proxMarkerColors = [];
    const proxMarkerSizes = [];
    const proxMarkerOpacities = [];

    data.forEach(d => {
        const isMatch = searchTerm !== '' && d.PLAYER_NAME.toLowerCase().includes(searchTerm);
        let settings = getMarkerSettings(searchTerm, isMatch, '#2E8B57');
        
        let baseSize = Math.max(10, Math.sqrt(d.FG3A) * 1.5);
        if (searchTerm !== '' && !isMatch) baseSize = 5;
        if (isMatch) baseSize = Math.max(20, baseSize * 1.2);

        proxMarkerColors.push(settings.color);
        proxMarkerSizes.push(baseSize);
        proxMarkerOpacities.push(settings.opacity);
    });

    const trace = {
        x: data.map(d => d.AVG_DEF_DIST),
        y: data.map(d => d.FG3_PCT * 100),
        customdata: data,
        mode: 'markers',
        type: 'scatter',
        text: data.map(d => `<b>${d.PLAYER_NAME}</b><br>Avg Def Dist: ${d.AVG_DEF_DIST.toFixed(2)} ft<br>Overall 3P%: ${(d.FG3_PCT*100).toFixed(1)}%<br>Gravity Index: ${(d.Gravity_Index || 0).toFixed(2)}`),
        hoverinfo: 'text',
        marker: { size: proxMarkerSizes, color: proxMarkerColors, opacity: proxMarkerOpacities }
    };
    let layout = {...commonLayout, xaxis: { title: 'Average Defender Distance (feet)', gridcolor: 'rgba(255,255,255,0.1)' }, yaxis: { title: 'Standard Overall 3P% (%)', gridcolor: 'rgba(255,255,255,0.1)' }};
    Plotly.newPlot(containerId, [trace], layout, {responsive: true});
}

function buildDumbbellPlot(data, searchTerm, containerId) {
    let dumbbellData = data.filter(d => d.Group !== 'Standard' || (searchTerm !== '' && d.PLAYER_NAME.toLowerCase().includes(searchTerm)));
    dumbbellData.sort((a, b) => a.GAE - b.GAE);
    
    if (dumbbellData.length > 30) dumbbellData = dumbbellData.slice(-30);

    const dbTraces = [];
    dumbbellData.forEach(d => {
        dbTraces.push({ x: [d.FG3_PCT * 100, d.GAE * 100], y: [d.PLAYER_NAME, d.PLAYER_NAME], mode: 'lines', line: {color: 'rgba(255,255,255,0.2)', width: 2}, showlegend: false, hoverinfo: 'none' });
    });
    dbTraces.push({
        x: dumbbellData.map(d => d.FG3_PCT * 100), y: dumbbellData.map(d => d.PLAYER_NAME), customdata: dumbbellData, mode: 'markers', name: 'Standard 3P%', marker: {color: nbaRed, size: 10}, text: dumbbellData.map(d => `Standard: ${(d.FG3_PCT*100).toFixed(1)}%`), hoverinfo: 'text+y'
    });
    dbTraces.push({
        x: dumbbellData.map(d => d.GAE * 100), y: dumbbellData.map(d => d.PLAYER_NAME), customdata: dumbbellData, mode: 'markers', name: `GAE (${Math.round(currentGravityWeight * 100)}% Prox + ${(currentTeamWeight * 100).toFixed(1)}% Team)`, marker: {color: '#2E8B57', size: 10}, text: dumbbellData.map(d => `GAE: ${(d.GAE*100).toFixed(1)}% (Shift: ${(d.GAE_DIFF*100 >= 0 ? '+' : '')}${(d.GAE_DIFF*100).toFixed(1)}%)`), hoverinfo: 'text+y'
    });

    let layout = {...commonLayout, margin: { t: 20, l: 150, r: 20, b: 50 }, xaxis: { title: 'Efficiency (%)', gridcolor: 'rgba(255,255,255,0.1)' }, yaxis: { title: '', gridcolor: 'rgba(255,255,255,0.05)', tickfont: {size: 11} }, showlegend: true, legend: { x: 1, y: 0, xanchor: 'right', yanchor: 'bottom', bgcolor: 'rgba(0,0,0,0.5)' }};
    Plotly.newPlot(containerId, dbTraces, layout, {responsive: true});
}

function handlePlotClick(data) {
    if (data.points && data.points.length > 0) {
        const player = data.points[0].customdata;
        if (player) openModal(player);
    }
}

function renderTable(data, searchTerm) {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';

    const sortedData = [...data].sort((a, b) => {
        let valA = a[currentSortColumn];
        let valB = b[currentSortColumn];
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return currentSortDesc ? 1 : -1;
        if (valA > valB) return currentSortDesc ? -1 : 1;
        return 0;
    });

    sortedData.forEach(d => {
        const tr = document.createElement('tr');
        if (searchTerm !== '' && d.PLAYER_NAME.toLowerCase().includes(searchTerm)) {
            tr.style.backgroundColor = 'rgba(249, 160, 27, 0.2)';
        }
        
        const diffVal = d.GAE_DIFF * 100;
        const diffClass = diffVal > 0.05 ? 'delta-pos' : (diffVal < -0.05 ? 'delta-neg' : 'delta-neutral');
        const diffText = (diffVal >= 0 ? '+' : '') + diffVal.toFixed(1) + '%';
        const teamKey = d.TEAM_ABBREVIATION || 'N/A';

        tr.innerHTML = `
            <td>
                <div class="player-cell">
                    <img class="player-avatar" 
                         src="${getPlayerHeadshotUrl(d.PLAYER_ID)}" 
                         onerror="this.onerror=null; this.src='${DEFAULT_AVATAR}'" 
                         alt="${d.PLAYER_NAME}" 
                         loading="lazy" />
                    <div class="player-name-wrap">
                        <strong>${d.PLAYER_NAME}</strong>
                        <span class="player-sub">${d.POSITION || 'N/A'}</span>
                    </div>
                </div>
            </td>
            <td>
                <div class="team-cell">
                    <img class="team-mini-logo" 
                         src="${getTeamLogoUrl(d.TEAM_ABBREVIATION)}" 
                         onerror="this.onerror=null; this.src='${DEFAULT_LOGO}'" 
                         alt="${teamKey}" />
                    <span>${teamKey}</span>
                </div>
            </td>
            <td>${d.POSITION || 'N/A'}</td>
            <td>${d.FG3A}</td>
            <td>${(d.FG3_PCT * 100).toFixed(1)}%</td>
            <td class="highlight-col">${(d.GAE * 100).toFixed(1)}%</td>
            <td><span class="delta-badge ${diffClass}">${diffText}</span></td>
            <td>${(d.Gravity_Index || 0).toFixed(2)}</td>
            <td>${(d.AVG_DEF_DIST || 0).toFixed(2)}</td>
        `;
        
        tr.addEventListener('click', () => openModal(d));
        tr.style.cursor = 'pointer';
        tbody.appendChild(tr);
    });
}

function openModal(player) {
    document.getElementById('modalPlayerName').innerText = player.PLAYER_NAME;
    document.getElementById('modalTeamPos').innerText = `${player.TEAM_ABBREVIATION || 'N/A'} | ${player.POSITION || 'N/A'}`;
    
    const modalImg = document.getElementById('modalPlayerImg');
    if (modalImg) {
        modalImg.src = getPlayerHeadshotUrl(player.PLAYER_ID);
        modalImg.onerror = function() { this.src = DEFAULT_AVATAR; };
    }

    const modalTeam = document.getElementById('modalTeamLogo');
    if (modalTeam) {
        modalTeam.src = getTeamLogoUrl(player.TEAM_ABBREVIATION);
        modalTeam.onerror = function() { this.src = DEFAULT_LOGO; };
    }

    document.getElementById('modalGAE').innerText = `${(player.GAE * 100).toFixed(1)}%`;
    document.getElementById('modal3P').innerText = `${(player.FG3_PCT * 100).toFixed(1)}%`;
    document.getElementById('modalGravity').innerText = (player.Gravity_Index || 0).toFixed(2);
    document.getElementById('modal3PA').innerText = player.FG3A;
    document.getElementById('modalCS3PA').innerText = player.CATCH_SHOOT_FG3A;
    document.getElementById('modalDefDist').innerText = `${(player.AVG_DEF_DIST || 0).toFixed(2)} ft`;

    const diffVal = player.GAE_DIFF * 100;
    const diffText = (diffVal >= 0 ? '+' : '') + diffVal.toFixed(1) + '% vs raw';
    const diffBadge = document.getElementById('modalGaeDiffBadge');
    if (diffBadge) {
        diffBadge.innerText = diffText;
        diffBadge.style.color = diffVal >= 0 ? '#52C47D' : '#ff6b81';
    }

    const gravBadge = document.getElementById('modalGravityBadge');
    if (gravBadge) {
        const gravScore = (player.Gravity_Index || 0);
        gravBadge.innerText = `${gravScore >= 0 ? '+' : ''}${gravScore.toFixed(2)} Gravity`;
        gravBadge.style.color = gravScore >= 0 ? '#52C47D' : '#ff6b81';
        gravBadge.style.borderColor = gravScore >= 0 ? 'rgba(82, 196, 125, 0.4)' : 'rgba(255, 71, 87, 0.4)';
        gravBadge.style.background = gravScore >= 0 ? 'rgba(82, 196, 125, 0.15)' : 'rgba(255, 71, 87, 0.15)';
    }

    const dist = player.AVG_DEF_DIST || 6.5;
    const distSummary = document.getElementById('modalDefDistSummary');
    if (distSummary) distSummary.innerText = `Defender Distance: ${dist.toFixed(2)} ft`;

    const minScale = 3.5;
    const maxScale = 7.5;
    const clampedDist = Math.max(minScale, Math.min(maxScale, dist));
    const pinPct = ((clampedDist - minScale) / (maxScale - minScale)) * 100;
    const meterPin = document.getElementById('modalMeterPin');
    if (meterPin) meterPin.style.left = `${pinPct}%`;

    document.getElementById('playerModal').classList.remove('hidden');
}
