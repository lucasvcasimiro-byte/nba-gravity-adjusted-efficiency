let globalData = [];
let currentSortColumn = 'GAE';
let currentSortDesc = true;

// NBA Theme Colors for JS
const nbaBlue = '#1D428A';
const nbaRed = '#C9082A';
const highlightColor = '#F9A01B';

document.addEventListener('DOMContentLoaded', () => {
    fetch('gae_data.json?t=' + new Date().getTime())
        .then(response => response.json())
        .then(data => {
            globalData = data;
            populateFilters(globalData);
            
            // Initial render
            renderDashboard();
            renderExplorer();
        })
        .catch(err => console.error("Error loading data:", err));

    setupEventListeners();
});

function setupEventListeners() {
    // Nav Tabs Logic
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Remove active from all tabs
            navTabs.forEach(t => t.classList.remove('active'));
            // Add active to clicked tab
            tab.classList.add('active');

            // Hide all views
            document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
            
            // Show target view
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');

            // Re-render plots to fix Plotly dimension issues in hidden divs
            if (targetId === 'dashboard-view') renderDashboard();
            if (targetId === 'explorer-view') renderExplorer();
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
    Array.from(teams).sort().forEach(team => {
        const option = document.createElement('option');
        option.value = team;
        option.textContent = team;
        teamSelect.appendChild(option);
    });
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
    
    // We only filter for Dumbbell plot length if needed, but we don't filter out data here.
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

    // Strict Filter Data for Explorer
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
        document.getElementById('leaderboardBody').innerHTML = '<tr><td colspan="8" style="text-align:center;">No data matches</td></tr>';
        return;
    }

    buildGaePlot(filteredData, searchTerm, 'gaeScatterPlot-exp');
    buildProximityPlot(filteredData, searchTerm, 'proximityScatterPlot-exp');
    
    document.getElementById('gaeScatterPlot-exp').on('plotly_click', handlePlotClick);
    document.getElementById('proximityScatterPlot-exp').on('plotly_click', handlePlotClick);

    renderTable(filteredData, searchTerm);
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
        text: data.map(d => `<b>${d.PLAYER_NAME}</b><br>Standard 3P%: ${(d.FG3_PCT*100).toFixed(1)}%<br>GAE: ${(d.GAE*100).toFixed(1)}%`),
        hoverinfo: 'text',
        marker: { size: gaeMarkerSizes, color: gaeMarkerColors, opacity: gaeMarkerOpacities, line: { width: gaeMarkerLines, color: gaeMarkerLineColors } }
    };

    const maxVal = Math.max(...data.map(d => d.FG3_PCT * 100), ...data.map(d => d.GAE * 100));
    const minVal = Math.min(...data.map(d => d.FG3_PCT * 100), ...data.map(d => d.GAE * 100));
    const lineTrace = { x: [minVal, maxVal], y: [minVal, maxVal], mode: 'lines', type: 'scatter', line: { dash: 'dash', color: 'rgba(255,255,255,0.3)' }, hoverinfo: 'none' };

    let layout = {...commonLayout, xaxis: { title: 'Standard Overall 3P% (%)', gridcolor: 'rgba(255,255,255,0.1)' }, yaxis: { title: 'Gravity-Adjusted Efficiency (GAE %)', gridcolor: 'rgba(255,255,255,0.1)' }};
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
        text: data.map(d => `<b>${d.PLAYER_NAME}</b><br>Avg Def Dist: ${d.AVG_DEF_DIST.toFixed(2)} ft<br>Overall 3P%: ${(d.FG3_PCT*100).toFixed(1)}%`),
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
        x: dumbbellData.map(d => d.GAE * 100), y: dumbbellData.map(d => d.PLAYER_NAME), customdata: dumbbellData, mode: 'markers', name: 'GAE', marker: {color: '#2E8B57', size: 10}, text: dumbbellData.map(d => `GAE: ${(d.GAE*100).toFixed(1)}%`), hoverinfo: 'text+y'
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
        
        tr.innerHTML = `
            <td><strong>${d.PLAYER_NAME}</strong></td>
            <td>${d.TEAM_ABBREVIATION || 'N/A'}</td>
            <td>${d.POSITION || 'N/A'}</td>
            <td>${d.FG3A}</td>
            <td>${(d.FG3_PCT * 100).toFixed(1)}%</td>
            <td class="highlight-col">${(d.GAE * 100).toFixed(1)}%</td>
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
    document.getElementById('modalGAE').innerText = `${(player.GAE * 100).toFixed(1)}%`;
    document.getElementById('modal3P').innerText = `${(player.FG3_PCT * 100).toFixed(1)}%`;
    document.getElementById('modalGravity').innerText = (player.Gravity_Index || 0).toFixed(2);
    document.getElementById('modal3PA').innerText = player.FG3A;
    document.getElementById('modalCS3PA').innerText = player.CATCH_SHOOT_FG3A;
    document.getElementById('modalDefDist').innerText = `${(player.AVG_DEF_DIST || 0).toFixed(2)} ft`;

    document.getElementById('playerModal').classList.remove('hidden');
}
