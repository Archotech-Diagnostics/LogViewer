/** 
 * ARCHOTECH LOG VIEWER - DATA RENDERER (log-renderer.js)
 * Dedicated logic for parsing, colorizing, and building HTML components.
 */

/**
 * getCategory: assigns a categorical type (error, warning, etc.) based on hex color.
 */
function getCategory(hex) {
    if (!hex) return 'info';
    const h = hex.toLowerCase();
    if (h === '#ff0000' || h === '#ff4d4d') return 'error';
    if (h === '#ffff00') return 'warning';
    if (h === '#ffffff') return 'info';
    if (h === '#ff80cc') return 'harmony';
    if (h === '#ff991a') return 'conflict';
    if (h === '#66e5ff') return 'custom';
    if (h === '#888888' || h === '#555555' || h === '#44cc44' || h === '#a6b8ff' || h === '#c7cb00') return 'meta';
    
    const r = parseInt(h.substring(1, 3), 16 || 0);
    const g = parseInt(h.substring(3, 5), 16 || 0);
    const b = parseInt(h.substring(5, 7), 16 || 0);
    if (r > 210 && g < 100 && b < 100) return 'error';
    if (r > 210 && g > 190 && b < 100) return 'warning';
    if (r > 200 && g < 160 && b > 160) return 'harmony';
    if (r < 150 && g > 190 && b > 190) return 'custom';
    if (r > 200 && g > 100 && g < 185 && b < 100) return 'conflict';
    return (r > 170 && g > 170 && b > 170) ? 'info' : 'meta';
}

/**
 * applyColors: parses ##CLR:rrggbb## tags embedded by ExportManager.cs
 * This ensures a 1:1 exact match with the RimWorld in-game console colors.
 * Used for "Raw Game Log" (Session Log).
 */
function applyColors(text) {
    if (!text) return '';
    const CLR_RE = /##CLR:([0-9A-Fa-f]{6})##/;
    const CLR_RE_GLOBAL = /##CLR:[0-9A-Fa-f]{6}##/g;
    if (typeof text !== 'string') return text;
    let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let lines = escaped.split(/\r?\n/);
    let result = [];
    let blockColor = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let hexColor = null;

        // 1. Extract and strip color tags FIRST
        const m = line.match(CLR_RE);
        if (m) {
            const hex = '#' + m[1];
            const cat = getCategory(hex);
            if (cat !== 'meta') {
                blockColor = hex;
            }
            hexColor = hex;
            line = line.replace(CLR_RE_GLOBAL, "");
        }

        // 2. Identify trace components AFTER tags are safely stripped
        const isTraceHeader = line.includes('--- STACK TRACE ---');
        const isTraceLine = line.trim().startsWith('at ');

        // 3. Fallback hardcoded colors
        if (line.includes('[H]')) {
            hexColor = '#ff80cc'; blockColor = '#ff80cc';
        } else if (line.includes('[!]') || line.includes('[+]') || line.includes('[?]')) {
            if (!hexColor) hexColor = '#44cc44';
        }

        // 4. Dividers
        if (line.includes('---------') || line.startsWith('===')) {
            blockColor = null; continue;
        }
        
        // 5. Build HTML
        const cat = getCategory(hexColor || blockColor);
        const isMeta = (cat === 'meta');
        
        let finalColor = (isTraceLine && isMeta) ? (blockColor || hexColor || '#ffffff') : (hexColor || blockColor || '#ffffff');
        
        if (isTraceHeader) {
            result.push(`<div class="log-rimworld-gray" style="font-weight: bold;">${line}</div>`);
        } else if (isTraceLine) {
            result.push(`<div class="log-trace" style="color: ${finalColor};">${line}</div>`);
        } else if (line.includes('[+]')) {
            result.push(`<div style="color:#44cc44; font-weight: bold;">${line}</div>`);
        } else if (line.includes('[!]')) {
            result.push(`<div style="color:#a6b8ff; font-weight: bold;">${line}</div>`);
        } else {
            result.push(`<div style="color:${finalColor};">${line}</div>`);
        }
    }
    return result.join('');
}

/**
 * applyColorsBlocked: parses ##CLR:rrggbb## tags and groups logical entries into blocks.
 * Ensures metadata (diagnostics, traces) is grouped with the message it describes.
 * Used for "Enhanced Game Log" and "Session Log".
 */
function applyColorsBlocked(text) {
    if (!text) return '';
    const CLR_RE = /##CLR:([0-9A-Fa-f]{6})##/; 
    const CLR_RE_GLOBAL = /##CLR:[0-9A-Fa-f]{6}##/g;

    let escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let lines = escaped.split(/\r?\n/);
    let blocks = [];
    let currentLines = [];
    let currentType = null;
    let currentBlockColor = null;

    function flushBlock() {
        if (currentLines.length === 0) return;
        blocks.push({ 
            type: currentType || 'info', 
            html: currentLines.join(''),
            color: currentBlockColor ? currentBlockColor.replace('#', '') : 'ffffff' 
        });
        currentLines = [];
    }

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        // 1. Extract and strip tags
        const m = line.match(CLR_RE);
        if (m) {
            let hex = "#" + m[1];
            let cat = getCategory(hex);
            
            flushBlock(); 
            currentBlockColor = hex;
            currentType = cat;
            line = line.replace(CLR_RE_GLOBAL, "");
        }

        // 2. Identify line types using the ALREADY CLEANED line (NO REGEX)
        const cleanLine = line.trim();
        const isDivider = line.includes('---------') || line.startsWith('===');
        const isTraceHeader = line.includes('--- STACK TRACE ---');
        const isTraceLine = cleanLine.startsWith('at ') || 
                           (cleanLine.includes(':') && cleanLine.includes('(') && cleanLine.endsWith(')'));

        if (!currentBlockColor) {
            if (line.includes('[H]')) {
                currentType = 'harmony'; currentBlockColor = '#ff80cc';
            } else if (line.includes('[!]') || line.includes('[+]') || line.includes('Suspect:')) {
                if (!currentType) currentType = 'meta'; 
                currentBlockColor = '#44cc44';
            }
        }

        // 4. Build Final HTML for this line
        let finalHTML = "";
        if (line.trim() === "") {
            finalHTML = `<div style="height: 18px; pointer-events: none;">&nbsp;</div>`;
        } else if (line.includes('[+]')) {
            finalHTML = `<div style="color:#44cc44; font-weight: bold;">${line}</div>`;
        } else if (line.includes('[!]')) {
            finalHTML = `<div style="color:#a6b8ff; font-weight: bold;">${line}</div>`;
        } else if (isDivider) {
            finalHTML = `<div class="log-rimworld-gray">${line}</div>`;
        } else if (isTraceHeader) {
            finalHTML = `<div class="log-rimworld-gray" style="font-weight: bold;">${line}</div>`;
        } else if (isTraceLine) {
            finalHTML = `<div class="log-trace">${line}</div>`;
        } else {
            finalHTML = `<div>${line}</div>`;
        }
        currentLines.push(finalHTML);
    }
    flushBlock(); 

    return blocks.map(b => {
        let logHTML = b.html;
        logHTML = logHTML.replace(/(?:<br\s*\/?>|\n|\r){2,}/g, "\n").trim();
        return `<div class="log-block enhanced-log-entry" data-logtype="${b.type}" style="color: #${b.color};">${logHTML}</div>`;
    }).join('');
}

/**
 * Main dispatcher for rendering loaded data across all tabs.
 */
async function renderData() {
    let firstActive = null;

    function process(data, btnId, targetId, colorize = true, useBlocks = false) {
        if (!data) return;
        document.getElementById(btnId).classList.remove('hidden');
        const area = document.getElementById(targetId);
        
        if (useBlocks || colorize) {
            area.innerHTML = useBlocks ? applyColorsBlocked(data) : applyColors(data);
        } else {
            area.textContent = data;
        }
        if (!firstActive) firstActive = targetId;
    }

    process(loadedData.session_log,   'btn-session',  'session-log',  true, true);
    process(loadedData.enhanced_log,  'btn-enhanced', 'enhanced-log', true, true);

    if (loadedData.mod_list) {
        try {
            const modsObj = typeof loadedData.mod_list === 'string' ? JSON.parse(loadedData.mod_list) : loadedData.mod_list;
            if (modsObj.activeMods) {
                myModsCache = modsObj.activeMods;
                
                // Prioritize embedded static previews (Core, DLCs, etc.)
                if (modsObj.staticPreviews) {
                    const previews = modsObj.staticPreviews;
                    myModsCache.forEach(m => {
                        const lowId = m.packageId.toLowerCase();
                        if (previews[lowId]) {
                            m.previewUrl = previews[lowId];
                        }
                    });
                }

                await fetchSteamUpdates(myModsCache);
            }
        } catch(e) {}
    }

    if (loadedData.player_log) {
        const el = document.getElementById('player-log');
        const note = '[ Source: Player.log — Unity Engine runtime log ]\n' + '-'.repeat(80) + '\n\n';
        el.textContent = note + loadedData.player_log;
        document.getElementById('btn-player').classList.remove('hidden');
        if (!firstActive) firstActive = 'player-log';
    }

    if (loadedData.load_time_data) {
        renderLoadTimeData(loadedData.load_time_data);
        document.getElementById('btn-load-time').classList.remove('hidden');
        if (!firstActive) firstActive = 'load-time';
    }

    if (loadedData.perf_scan_data) {
        renderPerfScanData(loadedData.perf_scan_data);
        document.getElementById('btn-perf-scan').classList.remove('hidden');
        if (!firstActive) firstActive = 'perf-scan';
    }

    if (loadedData.ai_diagnostic) {
        renderAIDiagnostic(loadedData.ai_diagnostic);
        document.getElementById('btn-ai').classList.remove('hidden');
        if (!firstActive) firstActive = 'ai-json';
    }

    process(loadedData.trace_report, 'btn-trace', 'trace-report', true, true);

    if (loadedData.color_legend) {
        const legendContainer = document.getElementById('dynamic-legend-container');
        if (legendContainer) {
            legendContainer.innerHTML = `<h4 data-i18n="KK_AD_Viewer_ColorLegend">Color Legend</h4>` + loadedData.color_legend;
        }
    }

    if (myModsCache && myModsCache.length > 0) {
        renderModTableBody(myModsCache, 'mod-table-body');
        document.getElementById('btn-mods').classList.remove('hidden');
        if (!firstActive) firstActive = 'mod-list';
    }

    if (urlTab) firstActive = urlTab;
    if (firstActive) switchTab(firstActive);

    const splash = document.getElementById('loading-splash');
    if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 550); }
}

/**
 * Renders the high-performance Load Time Analytics tab.
 */
function renderLoadTimeData(data) {
    const container = document.getElementById('load-time');
    if (!container) return;
    try {
        const json = typeof data === 'string' ? JSON.parse(data) : data;
        const totalGameTime = json.TotalGameLoadTime || 0;
        const impacts = json.Impacts || [];
        const totalModTimeSec = impacts.reduce((sum, m) => sum + (m.TimeMs || 0), 0) / 1000;
        const coreEngineTime = totalGameTime - totalModTimeSec;

        const trans = archotechTranslations;

        const bootTip = (trans['KK_AD_TotalBootTimeTip'] || "The total real-world time from launching the game until the Main Menu appears.").replace(/"/g, '&quot;');
        const modTip = (trans['KK_AD_ModProcessingTip'] || "The time the game spent physically loading custom mod files (like C# code and textures) into memory.").replace(/"/g, '&quot;');
        const coreTip = (trans['KK_AD_CoreEngineTimeTip'] || "The 'Hidden' time. The base game takes all the loaded mod files, dumps them into a giant blender, and stitches them together. Heavy mods increase this time significantly.").replace(/"/g, '&quot;');

        const mTip = (trans['KK_AD_MeasuredTimeTip'] || "The real clock time (in seconds) it took for the game to physically read this mod's files.").replace(/"/g, '&quot;');
        const xTip = (trans['KK_AD_XMLCountTip'] || "The number of Data definitions this mod adds to the game's database.").replace(/"/g, '&quot;');
        const aTip = (trans['KK_AD_AssetCountTip'] || "The total number of physical files (textures, audio clips).").replace(/"/g, '&quot;');
        const tTip = (trans['KK_AD_TypeCountTip'] || "The number of custom programming classes this mod injects.").replace(/"/g, '&quot;');

        let html = `
            <div class="summary-box-container">
                <div class="summary-box" title="${bootTip}"><div class="title">TOTAL BOOT TIME</div><div class="value">${totalGameTime.toFixed(2)}s</div></div>
                <div class="summary-box" title="${modTip}"><div class="title">MOD PROCESSING</div><div class="value">${totalModTimeSec.toFixed(2)}s</div></div>
                <div class="summary-box" title="${coreTip}"><div class="title">CORE ENGINE TIME</div><div class="value">${Math.max(0, coreEngineTime).toFixed(2)}s</div></div>
            </div>
        `;

        const renderGr = (title, list, styleType, showToggle = false) => {
            if (list.length === 0) return '';
            let gStyle = styleType === 'targeted' ? "border-left:4px solid #66e5ff; color:#66e5ff;" : "border-left:4px solid #c7cb00; color:#c7cb00;";
            
            let toggleHtml = showToggle ? `
                <label style="cursor:pointer; font-size: 10px; color: #888; margin-left:15px; display:inline-flex; align-items:center;">
                    <input type="checkbox" onchange="toggleCoreDLC(this)" style="margin-right:4px; vertical-align:middle; filter:hue-rotate(180deg) saturate(1.5);"> ${trans['KK_AD_Viewer_ShowCoreDLC'] || 'Show Core & DLC'}
                </label>` : "";

            const countId = styleType === 'targeted' ? 'count-targeted' : 'count-standard';

            let h = `<div class="group-header" style="${gStyle}">
                        <span>${title} ${toggleHtml}</span>
                        <span><span id="${countId}" data-full="${list.length}">${list.length}</span> ${trans['KK_AD_Viewer_ModsAffectingLoad'] || 'MODS AFFECTING LOAD TIME'}</span>
                     </div><div class="data-table-container">`;
            
            list.forEach((mod, idx) => {
                const isLudeon = (mod.PackageId || '').toLowerCase().startsWith('ludeon.');
                const ludeonClass = isLudeon ? 'core-dlc-row' : '';
                const timeSec = (mod.TimeMs || 0) / 1000;

                const tScr = timeSec * 10;
                const xScr = (mod.XmlCount || 0) * 0.03;
                const aScr = (mod.AssetSizeMB || 0) * 0.5;
                const cScr = (mod.TypeCount || 0) * 0.05;
                const maxScr = Math.max(tScr, xScr, aScr, cScr);

                let infoTip = trans['KK_AD_CheckModSizeTip'] || "Check mod size details.";
                if (maxScr === tScr) infoTip = trans['KK_AD_WhyIsItHereSlowLoading'] || "Ranked due to slow file reading.";
                else if (maxScr === xScr) infoTip = trans['KK_AD_WhyIsItHereLargeDatabase'] || "Ranked due to massive XML database additions.";
                else if (maxScr === aScr) infoTip = trans['KK_AD_WhyIsItHereLargeMedia'] || "Ranked due to intensive texture/audio payload.";
                else if (maxScr === cScr) infoTip = trans['KK_AD_WhyIsItHereComplexCode'] || "Ranked due to complex custom programming classes.";

                const infoHtml = `<i class="info-icon" title="${infoTip.replace(/"/g, '&quot;')}">i</i>`;

                h += `
                    <div class="compact-row ${ludeonClass}">
                        <div class="col-rank"></div>
                        <div class="col-modname ${isLudeon ? 'col-ludeon' : ''}">${mod.Name}</div>
                        <div class="col-info">${infoHtml}</div>
                        <div class="col-details">
                            <span title="${mTip}">Measured Time: ${timeSec.toFixed(2)}s</span> | 
                            <span title="${xTip}">XML: ${mod.XmlCount || 0}</span> | 
                            <span title="${aTip}">Assets: ${mod.AssetCount || 0} (${(mod.AssetSizeMB || 0).toFixed(1)} MB)</span> | 
                            <span title="${tTip}">C# Types: ${mod.TypeCount || 0}</span>
                        </div>
                    </div>
                `;
            });
            return h + '</div>';
        };

        html += `<div id="load-time-list" class="hide-core">`;
        html += renderGr('ACTIVE MOD SUBSYSTEMS', impacts, 'standard', true);
        html += `</div>`;
        container.innerHTML = html;

        updateLoadTimeHeaders();
    } catch (e) { console.error(e); }
}

/**
 * Global handler for the Core/DLC toggle in Load Time tab.
 */
function toggleCoreDLC(cb) {
    const list = document.getElementById('load-time-list');
    if (list) list.classList.toggle('hide-core', !cb.checked);
    updateLoadTimeHeaders();
}

/**
 * Updates the mod counts in the headers based on current visibility filters.
 */
function updateLoadTimeHeaders() {
    const list = document.getElementById('load-time-list');
    if (!list) return;
    const hideCore = list.classList.contains('hide-core');
    
    ['count-standard'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const group = el.closest('.group-header').nextElementSibling;
        if (!group) return;
        
        if (hideCore) {
            const count = group.querySelectorAll('.compact-row:not(.core-dlc-row)').length;
            el.innerText = count;
        } else {
            el.innerText = el.getAttribute('data-full');
        }
    });
}

/**
 * Renders the Performance Scan tab.
 * Layout mirrors DrawResults() in PerformanceScannerWindow.cs exactly:
 *   1. System health header
 *   2. Targeted mods (cyan, always shown regardless of score)
 *   3. Active non-framework mods sorted by severity (yellow header)
 *   4. Framework/Library mods at bottom (gray header)
 */
// Exact mirror of GetDiagnosisColor() from PerformanceScannerWindow.cs
// Unity Color values converted to CSS hex
const PERF_TAG_COLORS = {
    'CognitiveOverload':    '#00ffff',   // Color.cyan
    'BiologicalBloat':      '#00ff00',   // Color.green
    'EntityChoke':          '#ffff00',   // Color.yellow
    'VisualHemorrhage':     '#ff00ff',   // Color.magenta
    'DiagnosticHemorrhage': '#b31a1a',   // new Color(0.7,0.1,0.1) → dark red
    'FrameworkBurden':      '#6680cc',   // new Color(0.4,0.5,0.8) → slate blue
    'VanillaLimits':        '#ffffff',   // Color.white
    'HyperactiveLoop':      '#ff8000',   // new Color(1,0.5,0) → orange
    'ParasiticLoad':        '#ff0000',   // Color.red
    'ModConflict':          '#ff66cc',   // new Color(1,0.4,0.8) → conflict pink
};

function renderPerfScanData(data) {
    const container = document.getElementById('perf-scan');
    if (!container) return;
    try {
        if (!data || data === '""') {
            container.innerHTML = '<div class="empty-notice">No performance scan data available for this session.</div>';
            return;
        }

        const json = typeof data === 'string' ? JSON.parse(data) : data;
        const scanSec = json.TotalRuntime || 1;
        const records = json.Records || [];
        const trans = archotechTranslations;

        // Safe hex→rgba helper
        const hexToRgba = (hex, a) => {
            if (!hex || hex[0] !== '#') return `rgba(128,128,128,${a})`;
            const h = hex.length === 4 ? '#' + hex[1]+hex[1] + hex[2]+hex[2] + hex[3]+hex[3] : hex;
            const r = parseInt(h.slice(1,3), 16);
            const g = parseInt(h.slice(3,5), 16);
            const b = parseInt(h.slice(5,7), 16);
            if (isNaN(r) || isNaN(g) || isNaN(b)) return `rgba(128,128,128,${a})`;
            return `rgba(${r},${g},${b},${a})`;
        };

        // -- Partition records mirroring DrawResults() exactly --
        const SCORE_ORDER = { 'Critical': 4, 'Severe': 3, 'Elevated': 2, 'Nominal': 1 };

        // 1. Targeted mods — always shown, regardless of Score or IsFramework
        const targeted = records.filter(e => e.IsTargeted === true);

        // 2. Active non-framework mods — Mirrors in-game strict noise filter.
        //    Only show mods that have Elevated+ impact, a diagnosis tag, or reported errors.
        const activeMods = records
            .filter(e => !e.IsTargeted && !e.IsFramework && (e.Score !== 'Nominal' || (e.DiagnosisTags && e.DiagnosisTags.length > 0) || e.Errors > 0))
            .sort((a, b) => (SCORE_ORDER[b.Score] || 1) - (SCORE_ORDER[a.Score] || 1));

        // 3. Frameworks & Libraries — Mirrors in-game strict noise filter.
        const libraries = records.filter(e =>
            !e.IsTargeted && e.IsFramework && (e.Score !== 'Nominal' || (e.DiagnosisTags && e.DiagnosisTags.length > 0) || e.Errors > 0)
        );


        // -- System Health Header (mirrors hasCritical / DrawResults) --
        const hasCritical = records.some(e => !e.IsFramework && (e.Score === 'Severe' || e.Score === 'Critical'));
        const healthColor  = hasCritical ? '#ff4d4d' : '#44cc44';
        const healthLabel  = hasCritical
            ? (trans['KK_AD_Header_CriticalBottleneck'] || '⚠ CRITICAL BOTTLENECK DETECTED')
            : (trans['KK_AD_Header_SystemStable']       || '✓ SYSTEM STABLE');

        const totalOverheadMs  = activeMods.reduce((s, e) => s + (e.TotalMs || 0), 0);
        const totalOverheadPct = (totalOverheadMs / (scanSec * 1000) * 100).toFixed(1);
        const durMins = Math.floor(scanSec / 60);
        const durSecs = Math.floor(scanSec % 60);
        const durStr  = `${String(durMins).padStart(2,'0')}:${String(durSecs).padStart(2,'0')}`;

        // -- System Health & Bloat Headers (mirrors DrawResults) --
        let bloatHtml = '';
        
        // Memory Hemorrhage detection
        if (json.GCPerSec && json.GCPerSec > 1.0) {
            bloatHtml += `<div style="font-size:14px; font-weight:bold; color:#ff4d4d; margin-top:4px;">${trans['KK_AD_MemoryHemorrhage'] || '⚠ MEMORY HEMORRHAGE DETECTED'}</div>`;
        }

        // World Pawn Bloat
        if (json.WorldPawnCount && json.WorldPawnCount >= 1500) {
            const worldStr = trans['KK_AD_WorldPawnBloat'] ? trans['KK_AD_WorldPawnBloat'].replace('{0}', json.WorldPawnCount) : `WORLD PAWN BLOAT: Detected ${json.WorldPawnCount} world pawns.`;
            bloatHtml += `<div style="font-size:11px; color:#ffff00; margin-top:2px;">${worldStr}</div>`;
        }

        // Active Map Bloat
        if (json.ActiveMapFilthCount && json.ActiveMapFilthCount > 2000) {
            const bloatStr = trans['KK_AD_ActiveMapBloat'] ? trans['KK_AD_ActiveMapBloat'].replace('{0}', json.ActiveMapFilthCount) : `ACTIVE MAP BLOAT: Detected ${json.ActiveMapFilthCount} filth items.`;
            bloatHtml += `<div title="${trans['KK_AD_ActiveMapBloat'] || ''}" style="font-size:11px; color:#888; margin-top:2px; cursor:help;">${bloatStr}</div>`;
        }

        // History/Tale Bloat
        if (json.TaleCount && json.TaleCount > 500) {
            const taleStr = trans['KK_AD_TaleBloat'] ? trans['KK_AD_TaleBloat'].replace('{0}', json.TaleCount) : `TALE LOG BLOAT: Detected ${json.TaleCount} historical tales.`;
            bloatHtml += `<div style="font-size:11px; color:#ff9933; margin-top:2px;">${taleStr}</div>`;
        }

        let html = `
            <div style="margin-bottom:14px; border-bottom:1px solid #333; padding-bottom:10px;">
                <div style="font-size:16px; font-weight:bold; color:${healthColor}; margin-bottom:4px;">${healthLabel}</div>
                <div style="font-size:11px; color:#888;">
                    <span title="${trans['KK_AD_PerfScannerShortNote'] || ''}" style="cursor:help;">
                        ${trans['KK_AD_TotalModOverhead'] ? trans['KK_AD_TotalModOverhead'].replace('{0}', totalOverheadPct) : `Total Mod Overhead: ${totalOverheadPct}%`}
                    </span>
                    &nbsp;&nbsp;|&nbsp;&nbsp;
                    <span title="${trans['KK_AD_PerfScannerTechDetails'] || ''}" style="cursor:help;">
                        ${trans['KK_AD_ScanDurationLabel'] ? trans['KK_AD_ScanDurationLabel'].replace('{0}', durStr) : `Scan Duration: ${durStr}`}
                    </span>
                </div>
                ${bloatHtml}
            </div>
        `;

        // -- Card renderer — exact pixel-faithful mirror of DrawModSummary() --
        // Reference image shows: ultra-compact, ~20px per row, no wasted space.
        const renderCard = (entry, rank) => {
            const cpu = ((entry.TotalMs || 0) / (scanSec * 1000) * 100).toFixed(1);

            // Score label + color — mirrors: score >= Severe → red, else white
            const scoreLabel = trans[`KK_AD_Score_${entry.Score}`] || entry.Score || 'Nominal';
            const scoreColor = (entry.Score === 'Severe' || entry.Score === 'Critical') ? '#ff4d4d' : '#ffffff';

            // Row 2 — "Code Speed: Xms/tick | Real-Time Load: X% | Spike: Xms"
            // Color: gray, font: tiny — mirrors GUI.color = Color.gray
            const row2 = `
                <span title="${trans['KK_AD_CodeSpeedTip'] || ''}" style="cursor:help;">Code Speed: ${(entry.MsPerTick || 0).toFixed(3)}ms / tick</span>&nbsp;&nbsp;|&nbsp;&nbsp;
                <span title="${trans['KK_AD_RealTimeLoadTip'] || ''}" style="cursor:help;">Real-Time Load: ${cpu}%</span>&nbsp;&nbsp;|&nbsp;&nbsp;
                <span title="${trans['KK_AD_SpikeTip'] || ''}" style="cursor:help;">Spike: ${(entry.SpikeMs || 0).toFixed(2)}ms</span>`;

            // Row 3 optional: RAM (> 50 KB/s in-game threshold, we use 1.0 since export precision is lower)
            const ramHtml = (entry.RamKbSec > 1.0)
                ? `<div style="font-size:9px; color:#ff4d4d; line-height:16px;">${trans['KK_AD_RamLeak'] ? trans['KK_AD_RamLeak'].replace('{0}', entry.RamKbSec.toFixed(0)) : `Memory Allocating: ${entry.RamKbSec.toFixed(1)} KB/s`}</div>`
                : '';

            // Row 3 optional: Accomplices — red, mirrors "KK_AD_Accomplices"
            const accompliceHtml = entry.AccompliceString
                ? `<div style="font-size:9px; color:#ff4d4d; line-height:16px;">${trans['KK_AD_Accomplices'] ? trans['KK_AD_Accomplices'].replace('{0}', entry.AccompliceString) : `Accomplices: ${entry.AccompliceString}`}</div>`
                : '';

            // Row 3.5 optional: Direct culprit — yellow, Top 10 or targeted only (TIER-18)
            let culpritHtml = '';
            if ((rank < 10 || entry.IsTargeted) && entry.ActiveCulprit) {
                // Mirror: culpritText.Colorize(Color.yellow)
                const culpritLabel = entry.DefName
                    ? `${entry.ActiveCulprit} (${entry.DefName}) — ${(entry.CulpritMaxSpikeMs || 0).toFixed(2)}ms`
                    : `${entry.ActiveCulprit} — ${(entry.CulpritMaxSpikeMs || 0).toFixed(2)}ms`;
                culpritHtml = `<div style="font-size:9px; color:#ffff00; line-height:16px;">${culpritLabel}</div>`;
            }

            // Row 4: Diagnosis tags — mirrors DrawDiagnosisTag() exactly:
            //   120×20px box, centered text, GameFont.Tiny, colored border + 20% fill
            let tagsHtml = '';
            if (entry.DiagnosisTags && entry.DiagnosisTags.length > 0) {
                tagsHtml = entry.DiagnosisTags.map(tagKey => {
                    const color = PERF_TAG_COLORS[tagKey] || '#ffffff';
                    const label = trans[`KK_AD_${tagKey}`] || tagKey;
                    const tip   = trans[`KK_AD_${tagKey}Tip`] || '';
                    // Convert hex to rgba for 20% fill background
                    const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
                    const bg = `rgba(${r},${g},${b},0.20)`;
                    return `<span title="${tip}" style="display:inline-flex; align-items:center; justify-content:center; width:120px; height:20px; border:1px solid ${color}; background:${bg}; color:${color}; font-size:10px; font-weight:bold; text-transform:uppercase; letter-spacing:0.3px; margin-right:4px; margin-bottom:2px; cursor:help;">${label}</span>`;
                }).join('');
            } else {
                // "No active bottlenecks detected" — gray box exactly like in-game
                const noTagTip = (entry.IsTargeted && (entry.TotalMs||0) <= 0) 
                    ? (trans['KK_AD_Healthy_Targeted_Tip'] || '') 
                    : (trans['KK_AD_NoDiagnosisTagsTip'] || '');
                tagsHtml = `<span title="${noTagTip}" style="display:inline-flex; align-items:center; justify-content:center; width:200px; height:20px; border:1px solid #555; background:rgba(128,128,128,0.2); color:#999; font-size:10px; margin-bottom:2px; cursor:help;">${trans['KK_AD_NoDiagnosisTags'] || 'No active bottlenecks detected.'}</span>`;
            }

            // Row 5 optional: Dev Readout — horizontal rule then single line
            // Title color: cyan if targeted, white if not (mirrors .Colorize(isTargeted ? Color.cyan : Color.white))
            let devHtml = '';
            if (entry.HasDevData) {
                const devColor = entry.IsTargeted ? '#00ffff' : '#888';
                const methods = (entry.TopMethods || []).map(m => {
                    const shortType = (m.Type || '').split('.').pop();
                    const ramStr = m.AllocKb > 0.1 ? ` [${m.AllocKb.toFixed(1)} KB]` : '';
                    return `<div style="font-size:11px; color:#aaa; font-family:Consolas,monospace; line-height:16px; padding-left:10px;">» ${shortType}.${m.Method}: ${m.TimeMs.toFixed(2)}ms${ramStr}</div>`;
                }).join('');
                devHtml = `
                    <div style="border-top:1px solid #222; margin-top:3px; padding-top:3px;">
                        <div style="font-size:11px; line-height:16px;">
                            <span style="color:${devColor}; font-weight:bold; cursor:help;" title="${trans['KK_AD_TargetModTooltip'] || ''}">${trans['KK_AD_DeveloperReadoutTitle'] || 'ARCHOTECH DEVELOPER READOUT'}</span>
                            <span style="color:#666;"> - 
                                <span title="${trans['KK_AD_Tooltip_Footprint'] || ''}" style="cursor:help;">${(entry.DevSizeMB||0).toFixed(1)} MB Assets</span> | 
                                <span title="${trans['KK_AD_Tooltip_XML'] || ''}" style="cursor:help;">${entry.DevDefCount||0} XML Defs</span> | 
                                <span title="${trans['KK_AD_Tooltip_Patches'] || ''}" style="cursor:help;">${entry.DevPatchCount||0} Harmony Patches</span>
                                ${entry.DevVRAMMB > 0 ? ` | <span title="${trans['KK_AD_Tooltip_VRAM'] || ''}" style="cursor:help;">${trans['KK_AD_GPUVRAMLoad'] ? trans['KK_AD_GPUVRAMLoad'].replace('{0}', entry.DevVRAMMB.toFixed(1)) : `${entry.DevVRAMMB.toFixed(1)} MB VRAM`}</span>` : ''}
                            </span>
                        </div>
                        ${methods}
                    </div>`;
            }

            // Card background: targeted gets a teal tint (mirrors Widgets.DrawBoxSolid new Color(0.1,0.3,0.4,0.3))
            const cardBg = entry.IsTargeted ? 'background:rgba(26,77,102,0.3); border:1px solid #335566;' : 'background:#111; border:1px solid #232320;';

            return `
                <div style="${cardBg} margin-bottom:2px; padding:4px 8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1px;">
                        <div style="font-weight:bold; font-size:14px; color:#fff;">${entry.ModName}</div>
                        <div title="${trans['KK_AD_Score_Tip'] || ''}" style="font-size:11px; font-weight:bold; color:${scoreColor}; cursor:help;">${scoreLabel}</div>
                    </div>
                    <div style="font-size:11px; color:#777; margin-bottom:2px; line-height:16px;">${row2}</div>
                    ${ramHtml}
                    ${accompliceHtml}
                    ${culpritHtml}
                    <div style="display:flex; flex-wrap:wrap; gap:0; margin-bottom:${devHtml ? '2px' : '0'}; margin-top:2px;">${tagsHtml}</div>
                    ${devHtml}
                </div>
            `;
        };


        const hasAnything = targeted.length > 0 || activeMods.length > 0 || libraries.length > 0;

        if (!hasAnything) {
            html += '<div class="empty-notice">No significant performance impact or targeted mod metrics detected in this scan.</div>';
        } else {

            // SECTION 1: Targeted mods — cyan header, always shown
            if (targeted.length > 0) {
                html += `
                    <div class="group-header" style="border-left:4px solid #66e5ff; color:#66e5ff; margin-top:12px;">
                        <span>${trans['KK_AD_Header_TargetMods'] || 'TARGETED ANALYTICS'}</span>
                        <span>${targeted.length} ${targeted.length === 1 ? 'ENTRY' : 'ENTRIES'}</span>
                    </div>`;
                targeted.forEach(e => { html += renderCard(e, 0); });
            }

            // SECTION 2: Active non-framework mods — yellow header, sorted by severity
            if (activeMods.length > 0) {
                html += `
                    <div class="group-header" style="border-left:4px solid #c7cb00; color:#c7cb00; margin-top:12px;">
                        <span>${trans['KK_AD_PerfImpactRank'] || 'COMPUTATIONAL IMPACT RANKING'}</span>
                        <span>${activeMods.length} ${activeMods.length === 1 ? 'ENTRY' : 'ENTRIES'}</span>
                    </div>`;
                activeMods.forEach((e, i) => { html += renderCard(e, i); });
            }

            // SECTION 3: Frameworks & Libraries — gray header, at bottom
            if (libraries.length > 0) {
                html += `
                    <div class="group-header" style="border-left:4px solid #888; color:#888; margin-top:12px;">
                        <span>${trans['KK_AD_SharedLibraries'] || 'SHARED LIBRARIES & FRAMEWORKS'}</span>
                        <span>${libraries.length} ${libraries.length === 1 ? 'ENTRY' : 'ENTRIES'}</span>
                    </div>`;
                libraries.forEach(e => { html += renderCard(e, 999); });
            }
        }

        container.innerHTML = html;

    } catch (e) {
        console.error("Perf Scan Render Error:", e);
        const snippet = typeof data === 'string' ? data.substring(0, 400).replace(/</g, '&lt;') : "Complex Object";
        container.innerHTML = `
            <div class="empty-notice" style="color:#ff4d4d; border-color:#ff4d4d;">
                <strong>CRITICAL RENDERING ERROR</strong><br/>
                ${e.message}<br/><br/>
                <div style="font-size:10px; color:#888; text-align:left; background:#111; padding:10px; overflow:auto; max-height:200px;">
                    DATA SNIPPET: ${snippet}...
                </div>
            </div>`;
    }
}

/**
 * Renders the AI Master Data tab.
 */
function renderAIDiagnostic(data) {
    try {
        let masterText = "ARCHOTECH AI MASTER DIAGNOSTIC\n===============================\n";
        const aiObj = typeof data === 'string' ? JSON.parse(data) : data;
        const session = aiObj.session || {};
        masterText += `Summary: ${session.harmonyPatchesTracked || 0} Harmony patches tracked.\n\n`;
        masterText += "=== 1. SYSTEM & AI DIAGNOSTICS ===\n";
        if (session.activeDLCs) masterText += `Active DLCs: ${session.activeDLCs.join(", ")}\n`;
        masterText += JSON.stringify({ session, issueCount: aiObj.issues ? aiObj.issues.length : 0 }, null, 2) + "\n\n";
        masterText += "=== 2. ACTIVE MOD LIST ===\n";
        myModsCache.forEach(m => {
            let note = m.updateStatus === 'outdated' ? " [OUT OF DATE]" : "";
            masterText += `- ${m.name}${note} | ID: ${m.packageId} | Version: ${m.versions || 'Unknown'}\n`;
        });
        masterText += "\n=== 3. UNKNOWN TRACE REPORT ===\n" + (loadedData.trace_report || "None").trim() + "\n\n";
        masterText += "=== 4. ENHANCED GAME LOG ===\n" + (loadedData.enhanced_log || "").replace(/##CLR:[0-9A-Fa-f]{6}##/g, '').trim();
        document.getElementById('ai-json').textContent = masterText;
    } catch(e) { console.error(e); }
}

/**
 * Standard table builder for mod lists. Use to ensure identical styling across comparison views.
 */
function renderModTableBody(mods, tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // Header count injection
    const headerId = (tbodyId === 'mod-table-body') ? 'left-mod-header' : 'right-mod-header';
    const header = document.getElementById(headerId);
    if (header) {
        const baseText = (tbodyId === 'mod-table-body') ? (archotechTranslations['KK_AD_Viewer_YourModList'] || 'Your Mod List') : (archotechTranslations['KK_AD_Viewer_ComparedModList'] || 'Compared Mod List');
        header.innerText = `${baseText} (${mods.length})`;
    }

    const sortedMods = [...mods].sort((a, b) => (a.loadOrder || 0) - (b.loadOrder || 0));
    sortedMods.forEach((mod) => {
        const tr = document.createElement('tr');
        const safePackageId = mod.packageId.replace(/\./g, '_');
        const isSteam = mod.isWorkshop;
        const translations = archotechTranslations;
        const label = isSteam ? (translations['KK_AD_Viewer_Steam'] || "STEAM") : (translations['KK_AD_Viewer_Local'] || "LOCAL");
        
        let previewHtml = "";
        const isOnline = !window.archotechLocalData;
        
        if (isOnline) {
            // Online Mode: LOCAL preview.png can't exist outside your PC. 
            // We use a CSS-based placeholder that will be replaced by fetchSteamUpdates.
            // Using a low-res data URI tiny pixel to prevent 404 console spam and browser stalls.
            const initialSrc = mod.previewUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
            previewHtml = `<div class="preview-container" data-steam-id="${mod.steamId}">
                <img src="${initialSrc}" class="mod-preview" data-steam-id="${mod.steamId}" onerror="handleImageError(this, '${label}')" />
            </div>`;
        } else {
            // Local Mode: Use the actual Preview.png we copied into the export folder.
            previewHtml = `<div class="preview-container" data-steam-id="${mod.steamId}">
                <img src="Previews/${safePackageId}.png" class="mod-preview" data-steam-id="${mod.steamId}" onerror="handleImageError(this, '${label}')" />
            </div>`;
        }

        let statusHtml = '';
        if (!isSteam) {
            statusHtml = `<span style="font-size:10px; color:#5a5b49; font-weight:bold;">LOCAL</span>`;
        } else {
            let sClass = 'status-unknown';
            if (mod.updateStatus === 'updated') sClass = 'status-up-to-date';
            else if (mod.updateStatus === 'outdated') sClass = 'status-outdated';
            statusHtml = `<span class="status-dot ${sClass}"></span>`;
        }

        let n = mod.steamId && mod.steamId !== "null" ? `<a href="https://steamcommunity.com/workshop/filedetails/?id=${mod.steamId}" target="_blank">${mod.name}</a>` : mod.name;
        let v = (mod.versions || '').split(',').map(vStr => `<span class="version-tag">${vStr.trim()}</span>`).join('');

        tr.innerHTML = `
            <td class="order">${String(mod.loadOrder || 0).padStart(3, '0')}</td>
            <td>${previewHtml}</td>
            <td class="mod-name-cell">${n}</td>
            <td style="text-align: center;">${statusHtml}</td>
            <td class="meta-value">${mod.packageId}</td>
            <td class="meta-value">${mod.authors || 'Unknown'}</td>
            <td>${v}</td>
        `;
        tbody.appendChild(tr);
    });
}