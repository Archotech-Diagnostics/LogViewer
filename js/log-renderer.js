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
    if (h === '#ff0000') return 'deep-error';
    if (h === '#ff4d4d') return 'error';
    if (h === '#ffff00') return 'warning';
    if (h === '#ffffff') return 'info';
    if (h === '#66e5ff') return 'custom';
    if (h === '#888888' || h === '#555555' || h === '#44cc44' || h === '#a6b8ff' || h === '#c7cb00') return 'meta';
    
    const r = parseInt(h.substring(1, 3), 16 || 0);
    const g = parseInt(h.substring(3, 5), 16 || 0);
    const b = parseInt(h.substring(5, 7), 16 || 0);

    // Strict separation: Deep Red (Exception) vs Soft Red (Error)
    if (r > 200 && g < 50 && b < 50) return 'deep-error'; 
    if (r > 200 && g < 100 && b < 100) return 'error'; 

    if (r > 210 && g > 190 && b < 100) return 'warning';
    if (r < 150 && g > 190 && b > 190) return 'custom';
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
            blockColor = null; 
            if (line.includes('---------')) {
                result.push(`<div style="border-bottom: 1px solid currentColor; margin-top: 10px; margin-bottom: 10px; opacity: 0.15;"></div>`);
            }
            continue;
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
                currentType = 'meta'; currentBlockColor = '#ff80cc';
            } else if (line.includes('[!]') || line.includes('Suspect:')) {
                if (!currentType) currentType = 'meta'; 
                currentBlockColor = '#44cc44';
            }
        }

        // 4. Build Final HTML for this line
        let finalHTML = "";
        if (line.trim() === "") {
            finalHTML = `<div style="height: 18px; pointer-events: none;">&nbsp;</div>`;
        } else if (line.match(/^\[ (WARNING|ERROR|MESSAGE) \].*$/)) {
            finalHTML = `<div style="font-weight: bold; font-size: 1.1em; margin-top: 15px;">${line}</div>`;
        } else if (line.includes('----------------------------------------')) {
            finalHTML = `<div style="border-bottom: 1px solid currentColor; margin-top: 15px; margin-bottom: 15px; opacity: 0.3;"></div>`;
        } else if (line.includes('==== WHAT IS THIS? ====')) {
            finalHTML = `<div style="font-weight: bold; margin-top: 2px; margin-bottom: 2px; border-left: 3px solid currentColor; padding-left: 8px;">${line}</div>`;
        } else if (line.includes('==== POTENTIAL SOURCE? ====')) {
            finalHTML = `<div style="font-weight: bold; margin-top: 2px; margin-bottom: 2px; border-left: 3px solid currentColor; padding-left: 8px;">${line}</div>`;
        } else if (line.includes('[!]')) {
            finalHTML = `<div style="color:#a6b8ff; font-weight: bold;">${line}</div>`;
        } else if (line.trim().startsWith('Source:')) {
            finalHTML = `<div style="font-weight: bold; margin-top: 2px;">${line}</div>`;
        } else if (line.trim().startsWith('Evidence:')) {
            finalHTML = `<div>${line}</div>`;
        } else if (line.trim().startsWith('Details:')) {
            finalHTML = `<div style="padding-left: 10px; font-style: italic; font-size: 0.9em;">${line}</div>`;
        } else if (line.trim().startsWith('Other mods involved:') || 
                   (archotechTranslations['KK_AL_OtherModsInvolved'] && line.trim().startsWith(archotechTranslations['KK_AL_OtherModsInvolved']))) {
            const tipText = archotechTranslations['KK_AL_Viewer_OtherModsInvolvedTip'] || "These are other mods that have patched the same game method. While not the primary source of the slowdown, they were active in the same code region and may be contributing factors.";
            finalHTML = `<div style="font-weight: bold; margin-top: 2px; display: flex; align-items: center; gap: 6px;">
                <span>${line}</span>
                <span class="help-icon" style="display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; background: #48433d; color: #c7cb00; font-size: 10px; cursor: help; font-weight: bold;" title="${tipText}">?</span>
            </div>`;
        } else if (isDivider) {
            finalHTML = `<div class="log-rimworld-gray">${line}</div>`;
        } else if (isTraceHeader) {
            finalHTML = `<div class="log-rimworld-gray" style="font-weight: bold; margin-top: 10px;">${line}</div>`;
        } else if (isTraceLine) {
            finalHTML = `<div class="log-trace">${line}</div>`;
        } else {
            finalHTML = `<div>${line}</div>`;
        }
        currentLines.push(finalHTML);
    }
    flushBlock(); 

    // Group the blocks by log entry to ensure exactly one toggle per entry
    const entries = [];
    let currentEntryBlocks = [];

    blocks.forEach(b => {
        currentEntryBlocks.push(b);
        const isIntro = b.html.includes('=== Archotech Logs: ENHANCED GAME LOG ===') || 
                        b.html.includes('=== Archotech Logs: FULL SESSION LOG ===') || 
                        b.html.includes('HOW TO READ THIS LOG:');
        const isSep = b.html.includes('border-bottom: 1px solid') || b.color === '555555';
        if (isSep || isIntro) {
            entries.push(currentEntryBlocks);
            currentEntryBlocks = [];
        }
    });
    if (currentEntryBlocks.length > 0) {
        entries.push(currentEntryBlocks);
    }

    return entries.map(entryBlocks => {
        // Check if this entry represents the introduction block
        const isIntro = entryBlocks.some(b => b.html.includes('=== Archotech Logs: ENHANCED GAME LOG ===') || 
                                               b.html.includes('=== Archotech Logs: FULL SESSION LOG ===') || 
                                               b.html.includes('HOW TO READ THIS LOG:'));

        // Find the primary type of the entry (the first block's type that is not 'meta')
        const primaryBlock = entryBlocks.find(b => b.type !== 'meta') || entryBlocks[0];
        const groupType = primaryBlock ? primaryBlock.type : 'info';

        const blocksHTML = entryBlocks.map(b => {
            let logHTML = b.html;
            logHTML = logHTML.replace(/(?:<br\s*\/?>|\n|\r){2,}/g, "\n").trim();
            const isSep = logHTML.includes('border-bottom: 1px solid') || b.color === '555555';
            const sepClass = isSep ? ' log-separator' : '';
            return `<div class="log-block enhanced-log-entry${sepClass}" data-logtype="${b.type}" style="color: #${b.color};">${logHTML}</div>`;
        }).join('');

        if (isIntro) {
            return `<div class="enhanced-log-group intro-group" data-is-intro="true" data-logtype="meta">${blocksHTML}</div>`;
        }
        return `<div class="enhanced-log-group" data-logtype="${groupType}">${blocksHTML}</div>`;
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



    if (loadedData.ai_diagnostic) {
        renderAIDiagnostic(loadedData.ai_diagnostic);
        document.getElementById('btn-ai').classList.remove('hidden');
        if (!firstActive) firstActive = 'ai-json';
    }


    if (loadedData.color_legend) {
        const legendContainer = document.getElementById('dynamic-legend-container');
        if (legendContainer) {
            legendContainer.innerHTML = `<h4 data-i18n="KK_AL_Viewer_ColorLegend">Log Guide</h4>` + loadedData.color_legend;
        }
    }

    if (myModsCache && myModsCache.length > 0) {
        renderModTableBody(myModsCache, 'mod-table-body');
        document.getElementById('btn-mods').classList.remove('hidden');
        if (!firstActive) firstActive = 'mod-list';
    }

    if (urlTab) firstActive = urlTab;
    if (firstActive) switchTab(firstActive);

    if (typeof injectCollapseToggles === 'function') {
        injectCollapseToggles('session-log');
        injectCollapseToggles('enhanced-log');
    }

    const splash = document.getElementById('loading-splash');
    if (splash) { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 550); }
}

/**
 * Renders the high-performance Load Time Analytics tab.
 */




/**
 * Renders the AI Master Data tab.
 */
function renderAIDiagnostic(data) {
    try {
        const aiObj = typeof data === 'string' ? JSON.parse(data) : data;
        const rawLines = aiObj.AI_Diagnostic_Export || [];
        
        let htmlLines = [];
        let currentSeverityColor = '#a6b8ff';
        
        for (let i = 0; i < rawLines.length; i++) {
            let line = rawLines[i];
            // Escape HTML-special characters so any residual tags print literally rather than being interpreted.
            let cleanLine = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            
            if (cleanLine.trim() === '') continue; // Skip blank sentinel lines
            
            // ── Section headers ────────────────────────────────────────────────
            if (cleanLine.includes('=== ENVIRONMENT ===') ||
                cleanLine.includes('=== ACTIVE MODS')    ||
                cleanLine.includes('=== DIAGNOSTICS')) {
                htmlLines.push(`<div style="color: #66e5ff; font-weight: bold; font-size: 1.1em; margin-top: 18px; margin-bottom: 6px; border-bottom: 1px solid #48433d; padding-bottom: 4px;">${cleanLine}</div>`);
                continue;
            }
            
            // ── Mimic Enhanced Log Section Headers ─────────────────────────────
            if (cleanLine.includes('==== WHAT IS THIS? ====') ||
                cleanLine.includes('==== POTENTIAL SOURCE? ====')) {
                htmlLines.push(`<div style="color: #44cc44; font-weight: bold; margin-top: 6px; margin-bottom: 4px; border-left: 3px solid #44cc44; padding-left: 8px;">${cleanLine}</div>`);
                continue;
            }
            
            // ── Separator between issues ───────────────────────────────────────
            if (cleanLine.startsWith('--------------------------------------------------')) {
                currentSeverityColor = '#a6b8ff';
                htmlLines.push(`<div style="border-top: 1px solid #2a2a2a; margin: 14px 0 8px 0;"></div>`);
                continue;
            }
            
            // ── Severity tags ─────────────────────────────────────────────────
            if (cleanLine.includes('[ WARNING ]')) {
                currentSeverityColor = '#ffff00';
                htmlLines.push(`<div style="color: #ffff00; font-weight: bold; font-size: 1.05em; margin-top: 4px;">${cleanLine}</div>`);
                continue;
            }
            if (cleanLine.includes('[ ERROR ]')) {
                currentSeverityColor = '#ff4d4d';
                htmlLines.push(`<div style="color: #ff4d4d; font-weight: bold; font-size: 1.05em; margin-top: 4px;">${cleanLine}</div>`);
                continue;
            }
            if (cleanLine.includes('[ CRITICAL ]')) {
                currentSeverityColor = '#ff0000';
                htmlLines.push(`<div style="color: #ff0000; font-weight: bold; font-size: 1.05em; margin-top: 4px;">${cleanLine}</div>`);
                continue;
            }
            
            // ── Mod list lines — flat, colored, one per mod ────────────────────
            // Format: [000] Mod Name (packageid) v... | Deps: [...] | Defs: N | Asm: bool
            let modMatch = cleanLine.match(/^(\[\d+\])\s+(.*?)\s+\(([\w\.\-]+)\)(.*)/);
            if (modMatch) {
                let loadOrder = modMatch[1];
                let modName   = modMatch[2];
                let packageId = modMatch[3];
                let rest      = modMatch[4];
                htmlLines.push(`<div style="font-family: monospace; font-size: 11px; color: #666; margin-bottom: 1px; white-space: pre-wrap;"><span style="color:#c7cb00;">${loadOrder}</span> <span style="color:#ffffff; font-weight: bold;">${modName}</span> <span style="color:#66e5ff;">(${packageId})</span><span style="color:#555;">${rest}</span></div>`);
                continue;
            }
            
            // ── Forensic fields (green) ────────────────────────────────────────
            if (cleanLine.startsWith('Suspect:') ||
                cleanLine.startsWith('Evidence:') ||
                cleanLine.startsWith('Exception Type:')) {
                let colonIdx = cleanLine.indexOf(':');
                let label = cleanLine.substring(0, colonIdx + 1);
                let val   = cleanLine.substring(colonIdx + 1);
                htmlLines.push(`<div style="color: #44cc44; margin-bottom: 2px;"><span style="font-weight: bold;">${label}</span>${val}</div>`);
                continue;
            }
            
            // ── Suspect statuses ──────────────────────────────────────────────
            if (cleanLine === archotechTranslations['KK_AL_ModListActive'] ||
                cleanLine === archotechTranslations['KK_AL_ModListInactive'] ||
                cleanLine === archotechTranslations['KK_AL_ModListDeleted'] ||
                cleanLine === archotechTranslations['KK_AL_ModListUnknown'] ||
                cleanLine === "Active Mod" || cleanLine === "Inactive Mod" ||
                cleanLine === "Deleted Mod" || cleanLine === "Unknown Mod") {
                
                let statusColor = '#a6b8ff';
                if (cleanLine.includes('Active') || cleanLine === archotechTranslations['KK_AL_ModListActive']) {
                    statusColor = '#66e5ff';
                } else if (cleanLine.includes('Inactive') || cleanLine === archotechTranslations['KK_AL_ModListInactive']) {
                    statusColor = '#ff80cc';
                } else if (cleanLine.includes('Deleted') || cleanLine === archotechTranslations['KK_AL_ModListDeleted']) {
                    statusColor = '#ff4d4d';
                } else if (cleanLine.includes('Unknown') || cleanLine === archotechTranslations['KK_AL_ModListUnknown']) {
                    statusColor = '#888888';
                }
                htmlLines.push(`<div style="color: ${statusColor}; font-weight: bold; margin-bottom: 2px;">${cleanLine}</div>`);
                continue;
            }

            // ── Details sub-fields (italicized dark gray/light gray) ───────────
            if (cleanLine.startsWith('Details:')) {
                htmlLines.push(`<div style="color: #888888; padding-left: 10px; font-style: italic; font-size: 0.9em; margin-bottom: 2px;">${cleanLine}</div>`);
                continue;
            }
            
            // ── Message & Trace (Green labels with severity colored content) ───
            if (cleanLine.startsWith('Message:') || cleanLine.startsWith('Trace:')) {
                let colonIdx = cleanLine.indexOf(':');
                let label = cleanLine.substring(0, colonIdx + 1);
                let val   = cleanLine.substring(colonIdx + 1);
                
                htmlLines.push(`<div style="color: ${currentSeverityColor}; margin-bottom: 2px;"><span style="font-weight: bold; color: #44cc44;">${label}</span>${val}</div>`);
                continue;
            }

            // ── Informational fields (soft blue or severity color) ──────────────
            if (cleanLine.startsWith('Explanation:') ||
                cleanLine.startsWith('Related:')     ||
                cleanLine.startsWith('Repeats:')     ||
                cleanLine.startsWith('Preceding Context:') ||
                cleanLine.startsWith('Harmony Patches on Stack Trace:') ||
                cleanLine.startsWith('Other mods involved:') ||
                cleanLine.startsWith('Involved Def:') ||
                cleanLine.startsWith('Missing Def:') ||
                cleanLine.startsWith('Exception Type:') ||
                cleanLine.startsWith('Game Phase:') ||
                cleanLine.startsWith('Game Ticks:') ||
                (archotechTranslations['KK_AL_OtherModsInvolved'] && cleanLine.startsWith(archotechTranslations['KK_AL_OtherModsInvolved']))) {
                let colonIdx = cleanLine.indexOf(':');
                let label = cleanLine.substring(0, colonIdx + 1);
                let val   = cleanLine.substring(colonIdx + 1);
                
                htmlLines.push(`<div style="color: #a6b8ff; margin-bottom: 2px;"><span style="font-weight: bold;">${label}</span>${val}</div>`);
                continue;
            }
            
            // ── Indented sub-lines (Harmony hits, context breadcrumbs) ─────────
            if (cleanLine.startsWith('  -') || cleanLine.startsWith('  [')) {
                htmlLines.push(`<div style="color: #888888; font-style: italic; margin-left: 14px; margin-bottom: 1px;">${cleanLine}</div>`);
                continue;
            }
            
            // ── Fallback ───────────────────────────────────────────────────────
            htmlLines.push(`<div style="color: #a6b8ff; margin-bottom: 2px;">${cleanLine}</div>`);
        }
        
        document.getElementById('ai-json').innerHTML = `
            <div style="font-family: Consolas, Monaco, monospace; font-size: 12px; line-height: 1.5; padding: 20px; background: #000; color: #a6b8ff; border-radius: 6px; border: 1px solid #48433d; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
                ${htmlLines.join('')}
            </div>
        `;
    } catch(e) { 
        console.error(e);
        document.getElementById('ai-json').textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }
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
        const baseText = (tbodyId === 'mod-table-body') ? (archotechTranslations['KK_AL_Viewer_YourModList'] || 'Your Mod List') : (archotechTranslations['KK_AL_Viewer_ComparedModList'] || 'Compared Mod List');
        header.innerText = `${baseText} (${mods.length})`;
    }

    const sortedMods = [...mods].sort((a, b) => (a.loadOrder || 0) - (b.loadOrder || 0));
    sortedMods.forEach((mod) => {
        const tr = document.createElement('tr');
        const safePackageId = mod.packageId.replace(/\./g, '_');
        const isSteam = mod.isWorkshop;
        const translations = archotechTranslations;
        const label = isSteam ? (translations['KK_AL_Viewer_Steam'] || "STEAM") : (translations['KK_AL_Viewer_Local'] || "LOCAL");
        
        // TIER-32: Rely exclusively on the Steam Proxy for mod icons. 
        // This eliminates the need for the heavy Previews folder syncing in C#.
        const initialSrc = mod.previewUrl || "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
        previewHtml = `<div class="preview-container" data-steam-id="${mod.steamId}">
            <img src="${initialSrc}" class="mod-preview" data-steam-id="${mod.steamId}" onerror="handleImageError(this, '${label}')" />
        </div>`;

        let tooltipText = "Local / Unknown";
        if (mod.localTime) {
            const localDate = new Date(mod.localTime * 1000).toLocaleString();
            tooltipText = `Local Update: ${localDate}`;
            if (mod.steamUpdateTime) {
                const steamDate = new Date(mod.steamUpdateTime * 1000).toLocaleString();
                tooltipText += ` | Steam Update: ${steamDate}`;
            }
        }

        // 1. Establish Absolute Status
        if (!isSteam) {
            mod.updateStatus = 'unknown';
        } else if (mod.localTime && mod.steamUpdateTime) {
            // 120-second (2 minute) grace period for Steam API / Local ACF desyncs
            if (mod.localTime < mod.steamUpdateTime - 120) {
                mod.updateStatus = 'outdated';
            } else {
                mod.updateStatus = 'updated';
            }
        } else {
            mod.updateStatus = 'unknown'; // Failsafe for un-polled Steam mods
        }

        // 2. Generate UI Component
        let statusHtml = '';
        if (!isSteam) {
            statusHtml = `<span style="font-size:10px; color:#5a5b49; font-weight:bold;" title="${tooltipText}">LOCAL</span>`;
        } else {
            let sClass = 'status-unknown';
            if (mod.updateStatus === 'updated') sClass = 'status-up-to-date';
            else if (mod.updateStatus === 'outdated') sClass = 'status-outdated';
            statusHtml = `<span class="status-dot ${sClass}" title="${tooltipText}"></span>`;
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
