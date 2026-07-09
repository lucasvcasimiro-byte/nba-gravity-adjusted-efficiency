let globalData = [];

// NBA Theme Colors for JS
const nbaBlue = '#1D428A';
const nbaRed = '#C9082A';
const bgDark = '#0B0F19';
const highlightColor = '#F9A01B'; // Golden Yellow for highlights

document.addEventListener('DOMContentLoaded', () => {
    fetch('gae_data.json')
        .then(response => response.json())
        .then(data => {
            globalData = data;
            renderPlots(globalData, '');
        })
        .catch(err => console.error("Error loading data:", err));

    const searchInput = document.getElementById('playerSearch');
    const searchBtn = document.getElementById('searchBtn');
    const resetBtn = document.getElementById('resetBtn');

    searchBtn.addEventListener('click', () => {
        renderPlots(globalData, searchInput.value);
    });

    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            renderPlots(globalData, searchInput.value);
        }
    });

    resetBtn.addEventListener('click', () => {
        searchInput.value = '';
        renderPlots(globalData, '');
    });
});

function renderPlots(data, searchTerm) {
    searchTerm = searchTerm.toLowerCase().trim();

    // Determine colors and opacities based on search
    const getMarkerSettings = (isHighlighted, defaultColor) => {
        if (searchTerm === '') {
            return { color: defaultColor, opacity: 0.7, size: 10, line: {color: 'white', width: 1} };
        }
        if (isHighlighted) {
            return { color: highlightColor, opacity: 1.0, size: 16, line: {color: 'white', width: 2} };
        }
        return { color: 'rgba(100, 100, 100, 0.2)', opacity: 0.2, size: 8, line: {color: 'transparent', width: 0} };
    };

    const gaeMarkerColors = [];
    const gaeMarkerSizes = [];
    const gaeMarkerOpacities = [];
    const gaeMarkerLines = [];
    const gaeMarkerLineColors = [];

    const proxMarkerColors = [];
    const proxMarkerSizes = [];
    const proxMarkerOpacities = [];
    const proxMarkerLines = [];
    const proxMarkerLineColors = [];

    data.forEach(d => {
        const isMatch = searchTerm !== '' && d.PLAYER_NAME.toLowerCase().includes(searchTerm);
        
        // GAE Scatter styling (Default Viridis-like based on Volume? Or just team color)
        // We'll use a standard blue for normal, yellow for search hit
        let gaeSettings = getMarkerSettings(isMatch, nbaBlue);
        gaeMarkerColors.push(gaeSettings.color);
        gaeMarkerSizes.push(gaeSettings.size);
        gaeMarkerOpacities.push(gaeSettings.opacity);
        gaeMarkerLines.push(gaeSettings.line.width);
        gaeMarkerLineColors.push(gaeSettings.line.color);

        // Proximity Scatter styling (Size depends on Catch & Shoot volume)
        let baseSize = Math.max(10, Math.sqrt(d.CATCH_SHOOT_FG3A) * 1.5);
        let proxSettings = getMarkerSettings(isMatch, '#2E8B57'); // SeaGreen
        if (searchTerm !== '' && !isMatch) baseSize = 5; // shrink non-matches
        if (isMatch) baseSize = Math.max(20, baseSize * 1.2);

        proxMarkerColors.push(proxSettings.color);
        proxMarkerSizes.push(baseSize);
        proxMarkerOpacities.push(proxSettings.opacity);
        proxMarkerLines.push(proxSettings.line.width);
        proxMarkerLineColors.push(proxSettings.line.color);
    });

    // 1. GAE vs Standard 3P%
    const gaeTrace = {
        x: data.map(d => d.FG3_PCT * 100),
        y: data.map(d => d.GAE * 100),
        mode: 'markers',
        type: 'scatter',
        text: data.map(d => `<b>${d.PLAYER_NAME}</b><br>Standard 3P%: ${(d.FG3_PCT*100).toFixed(1)}%<br>GAE: ${(d.GAE*100).toFixed(1)}%<br>Total 3PA: ${d.FG3A}`),
        hoverinfo: 'text',
        marker: {
            size: gaeMarkerSizes,
            color: gaeMarkerColors,
            opacity: gaeMarkerOpacities,
            line: { width: gaeMarkerLines, color: gaeMarkerLineColors }
        }
    };

    // y=x line
    const maxVal = Math.max(...data.map(d => d.FG3_PCT * 100), ...data.map(d => d.GAE * 100));
    const minVal = Math.min(...data.map(d => d.FG3_PCT * 100), ...data.map(d => d.GAE * 100));
    const lineTrace = {
        x: [minVal, maxVal],
        y: [minVal, maxVal],
        mode: 'lines',
        type: 'scatter',
        line: { dash: 'dash', color: 'rgba(255,255,255,0.3)' },
        hoverinfo: 'none',
        showlegend: false
    };

    const gaeLayout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#F8F9FA' },
        margin: { t: 20, l: 50, r: 20, b: 50 },
        xaxis: { title: 'Standard Overall 3P% (%)', gridcolor: 'rgba(255,255,255,0.1)' },
        yaxis: { title: 'Gravity-Adjusted Efficiency (GAE %)', gridcolor: 'rgba(255,255,255,0.1)' },
        showlegend: false,
        hovermode: 'closest'
    };

    Plotly.newPlot('gaeScatterPlot', [gaeTrace, lineTrace], gaeLayout, {responsive: true});


    // 2. Proximity Scatter
    const proxTrace = {
        x: data.map(d => d.AVG_DEF_DIST),
        y: data.map(d => d.FG3_PCT * 100),
        mode: 'markers',
        type: 'scatter',
        text: data.map(d => `<b>${d.PLAYER_NAME}</b><br>Avg Def Dist: ${d.AVG_DEF_DIST.toFixed(2)} ft<br>Overall 3P%: ${(d.FG3_PCT*100).toFixed(1)}%<br>C&S 3PA: ${d.CATCH_SHOOT_FG3A}`),
        hoverinfo: 'text',
        marker: {
            size: proxMarkerSizes,
            color: proxMarkerColors,
            opacity: proxMarkerOpacities,
            line: { width: proxMarkerLines, color: proxMarkerLineColors }
        }
    };

    const proxLayout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#F8F9FA' },
        margin: { t: 20, l: 50, r: 20, b: 50 },
        xaxis: { title: 'Average Defender Distance (feet)', gridcolor: 'rgba(255,255,255,0.1)' },
        yaxis: { title: 'Standard Overall 3P% (%)', gridcolor: 'rgba(255,255,255,0.1)' },
        showlegend: false,
        hovermode: 'closest'
    };

    Plotly.newPlot('proximityScatterPlot', [proxTrace], proxLayout, {responsive: true});


    // 3. Dumbbell Plot
    // Filter to Top 5, Bottom 5, Targets, and Search Matches
    let dumbbellData = data.filter(d => 
        d.Group !== 'Standard' || (searchTerm !== '' && d.PLAYER_NAME.toLowerCase().includes(searchTerm))
    );

    // Sort by GAE
    dumbbellData.sort((a, b) => a.GAE - b.GAE);

    const dbNames = dumbbellData.map(d => d.PLAYER_NAME);
    const dbStandard = dumbbellData.map(d => d.FG3_PCT * 100);
    const dbGae = dumbbellData.map(d => d.GAE * 100);

    const dbTraces = [];

    // Add lines connecting the two points
    for(let i=0; i<dumbbellData.length; i++) {
        dbTraces.push({
            x: [dbStandard[i], dbGae[i]],
            y: [dbNames[i], dbNames[i]],
            mode: 'lines',
            line: {color: 'rgba(255,255,255,0.2)', width: 2},
            showlegend: false,
            hoverinfo: 'none'
        });
    }

    // Add Standard dots
    dbTraces.push({
        x: dbStandard,
        y: dbNames,
        mode: 'markers',
        name: 'Standard 3P%',
        marker: {color: nbaRed, size: 12},
        text: dumbbellData.map(d => `Standard: ${(d.FG3_PCT*100).toFixed(1)}%`),
        hoverinfo: 'text+y'
    });

    // Add GAE dots
    dbTraces.push({
        x: dbGae,
        y: dbNames,
        mode: 'markers',
        name: 'GAE',
        marker: {color: '#2E8B57', size: 12},
        text: dumbbellData.map(d => `GAE: ${(d.GAE*100).toFixed(1)}%`),
        hoverinfo: 'text+y'
    });

    const dbLayout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { color: '#F8F9FA' },
        margin: { t: 20, l: 150, r: 20, b: 50 },
        xaxis: { title: 'Efficiency (%)', gridcolor: 'rgba(255,255,255,0.1)' },
        yaxis: { title: '', gridcolor: 'rgba(255,255,255,0.05)', tickfont: {size: 11} },
        showlegend: true,
        legend: { x: 1, y: 0, xanchor: 'right', yanchor: 'bottom', bgcolor: 'rgba(0,0,0,0.5)' },
        hovermode: 'closest'
    };

    Plotly.newPlot('dumbbellPlot', dbTraces, dbLayout, {responsive: true});
}
