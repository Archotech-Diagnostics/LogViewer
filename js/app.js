/** 
 * ARCHOTECH LOG VIEWER - CORE ENGINE (app.js)
 * Consolidated: globals.js, init.js, tabs-ui.js, mod-compare.js
 * Handles App Lifecycle, Navigation, and Global State.
 */

/* ── GLOBALS ───────────────────────────────────────────────────────────────── */

/**
 * Static encyclopedia dictionary loaded from Encyclopedia.json.
 * Maps short IDs (e.g. "Expl_NullRef") to full translation key strings
 * (e.g. "KK_AD_IssueExpl_NullRef") which are then resolved via archotechTranslations.
 * Also maps raw KK_AD_ keys directly to their English text for Enhanced Log rendering.
 */
let archotechEncyclopedia = {};

/**
 * Fetch and cache the static Encyclopedia.json dictionary.
 * Tries a relative path (local file:// mode) then the GitHub Pages root.
 * Fails silently — the viewer degrades gracefully without it.
 */
async function loadEncyclopedia() {
    const paths = [
        './Encyclopedia.json',
        'https://archotech-diagnostics.github.io/LogViewer/Encyclopedia.json'
    ];
    for (const p of paths) {
        try {
            const res = await fetch(p);
            if (res.ok) {
                archotechEncyclopedia = await res.json();
                console.log(`[Archotech] Encyclopedia loaded from ${p} (${Object.keys(archotechEncyclopedia).length} entries).`);
                return;
            }
        } catch (_) { /* try next path */ }
    }
    console.warn('[Archotech] Encyclopedia.json could not be loaded. Dictionary mapping disabled.');
}

const statusText = document.getElementById('status-text');
const activeTabClass = 'active';
let currentActiveTarget = null;
let currentFilter = 'all';

let loadedData = {
    ai_diagnostic: null,
    enhanced_log: null,
    session_log: null,
    trace_report: null,
    mod_list: null,
    player_log: null,
    color_legend: null,
    load_time_data: null,
    perf_scan_data: null
};

let myModsCache = [];
let theirModsCache = [];
let isCompareMode = false;
let currentCompareFilter = 'all';
let currentUpdateFilter = 'all';
let currentSearchTerm = '';
let currentCompareGistId = null;
let archotechTranslations = {};
let baseGistId = null;

/* ── TAB & FILTRATION UI ────────────────────────────────────────────────────── */
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        const target = e.target.dataset.target;
        if (target) switchTab(target);
    });
});

function switchTab(targetId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove(activeTabClass));
    const btn = document.querySelector(`.tab[data-target="${targetId}"]`);
    if (btn) btn.classList.add(activeTabClass);

    document.querySelectorAll('.content-area').forEach(c => c.classList.add('hidden'));
    const container = document.getElementById(targetId);
    if (container) container.classList.remove('hidden');

    const playerWarn = document.getElementById('player-log-warning');
    if (playerWarn) playerWarn.style.display = (targetId === 'player-log' ? 'block' : 'none');

    const translations = archotechTranslations;
    const descs = {
        'session-log': translations['KK_AD_Viewer_DescSessionLog'] || `<b>Raw Game Log:</b> A complete, sequentially accurate dump of every message sent to the game console during your current play session.<br/><br/><b>Use Case:</b> Perfect for seeing exactly when an error occurred in relation to other events. It contains the raw stack traces used by developers to pinpoint failing lines of code.`,
        'enhanced-log': translations['KK_AD_Viewer_DescEnhancedLog'] || `<b>Enhanced Game Log:</b> A user-friendly version of the game log designed for non-modders. It includes helpful notes and comments that explain exactly what each error means.<br/><br/><b>Use Case:</b> This is your primary troubleshooting tool. Look for the 'What happened' and 'Suspect' sections to find quick solutions.`,
        'ai-json': translations['KK_AD_Viewer_DescAIDiagnostics'] || `<b>AI Diagnostics:</b> A structured data package optimized for analysis by machine intelligence (Gemini, ChatGPT, Claude).<br/><br/><b>Use Case:</b> Export this file to let an AI solve complex mod conflicts or performance issues for you.`,
        'trace-report': translations['KK_AD_Viewer_DescTraceReport'] || `<b>DS Trace Report:</b> A collection of unidentified background processes captured by the Deep Scan engine.<br/><br/><b>Use Case:</b> Used by advanced troubleshooters to create new "fingerprints" for unidentified mods.`,
        'player-log': translations['KK_AD_Viewer_DescUnityLog'] || `<b>Unity Engine Log:</b> The system-level "Player.log" containing hardware and engine initialization telemetry.<br/><br/><b>Use Case:</b> Essential for identifying driver crashes or errors that happen before the game main menu loads.`,
        'mod-list': translations['KK_AD_Viewer_DescModList'] || `<b>Archotech Mod List:</b> A clinical manifest of all active biological supplements, including specific versions and IDs.<br/><br/><b>Use Case:</b> Verify load order and check for outdated versions using the integrated Steam Workshop sync.`,
        'load-time': translations['KK_AD_Viewer_DescLoadTime'] || `<b>Load Time Diagnostics:</b> This tab ranks the mods that impact your startup time the most, based on multiple performance factors detailed below for each mod.<br/><br/><b>Use Case:</b> Identify which mods are responsible for excessive startup times.`,
        'perf-scan': translations['KK_AD_Viewer_DescPerfScan'] || `<b>Performance Scan Log:</b> Real-time execution metrics captured during a live profiling of the game's simulation loop.<br/><br/><b>Use Case:</b> Pinpoint exactly which modded methods are stealing your TPS and causing late-game lag.`

    };

    const descEl = document.getElementById('tab-description');
    if (descEl && descs[targetId]) {
        let text = descs[targetId];

        // 1. Normalize line breaks and XML entities from translation files
        text = text.replace(/\n/g, '<br/>');
        text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

        // 2. Format the primary title (Everything up to the first colon)
        let colonIndex = text.indexOf(':');
        if (colonIndex > -1 && colonIndex < 60) {
            let titlePart = text.substring(0, colonIndex + 1);
            let bodyPart = text.substring(colonIndex + 1);

            // Strip any existing bold/span tags from the title to prevent HTML nesting errors
            titlePart = titlePart.replace(/<[^>]+>/g, '');

            // Wrap the clean title in our exact style
            text = `<span style="color: #c7cb00; font-weight: bold;">${titlePart}</span>${bodyPart}`;
        }

        // 3. Normalize "Use Case:" labeling and spacing
        text = text.replace(/[\n\s]*(?:<br\/>\s*)*(?:<b>|&lt;b&gt;)?Use Case:(?:<\/b>|&lt;\/b&gt;)?[\n\s]*/gi, '<br/><span style="color: #c7cb00; font-weight: bold;">Use Case:</span> ');

        // 4. Ensure any remaining standard bold tags inherit the Archotech yellow
        text = text.replace(/<b>(.*?)<\/b>/g, '<span style="color: #c7cb00; font-weight: bold;">$1</span>');

        descEl.innerHTML = text;
    }

    currentActiveTarget = targetId;
    const isFilterableTab = (targetId === 'session-log' || targetId === 'enhanced-log');
    const isModListTab = (targetId === 'mod-list');

    const fBar = document.getElementById('filter-bar');
    if (fBar) fBar.classList.toggle('hidden', !isFilterableTab);
    const mBar = document.getElementById('mod-filter-bar');
    if (mBar) mBar.classList.toggle('hidden', !isModListTab);

    if (isFilterableTab) setFilter('all');
    if (isModListTab) { setCompareFilter('all'); setUpdateFilter('all'); }
    window.scrollTo(0, 0);
}

function setFilter(type) {
    if (currentFilter === type && type !== 'all') type = 'all';
    currentFilter = type;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === type));
    applyFilter(currentActiveTarget, type);
    window.scrollTo(0, 0);
}

function applyFilter(targetId, filterType) {
    if (!targetId || (targetId !== 'session-log' && targetId !== 'enhanced-log')) return;
    const container = document.getElementById(targetId);
    if (!container) return;
    container.querySelectorAll('.log-block').forEach(block => {
        const btype = block.dataset.logtype;
        if (btype === 'meta' || filterType === 'all') { block.style.display = ''; return; }
        const show = (filterType === 'error' ? (btype === 'error' || btype === 'deep-error') : btype === filterType);
        block.style.display = show ? '' : 'none';
    });
}

function copyActiveContent() {
    const exportData = getActiveContentForExport();
    if (!exportData) return;
    // For JSON files, copy the raw JSON string; for text files, copy as-is.
    navigator.clipboard.writeText(exportData.content).then(() => {
        const btn = document.getElementById('global-copy-btn');
        const oldBody = btn.innerHTML;
        btn.innerHTML = "COPIED!";
        setTimeout(() => btn.innerHTML = oldBody, 2000);
    });
}

function saveActiveContent() {
    const exportData = getActiveContentForExport();
    if (!exportData) return;

    const blob = new Blob([exportData.content], { type: exportData.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = exportData.filename;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a); 
    URL.revokeObjectURL(url);
}

function getActiveContentForExport() {
    if (!currentActiveTarget) return null;

    let content = "";
    let filename = currentActiveTarget + ".txt";
    let mimeType = "text/plain";
    const trans = archotechTranslations;

    // ── CORE HELPERS ──────────────────────────────────────────────────────────
    // Strip ##CLR:rrggbb## color tokens from raw log strings.
    // This is the only transformation needed — all [+], [!], metadata lines,
    // stack traces, and spacing are preserved exactly as exported by the C# engine.
    const stripColorCodes = (text) => {
        if (!text) return '';
        return text.replace(/##CLR:[0-9A-Fa-f]{6}##/g, '');
    };

    // For the raw session log: ##CLR:xxxxxx## is the definitive per-entry marker
    // the C# engine writes at the start of every log message. After stripping the
    // colour tokens we insert a blank line *where each token was* so the saved file
    // has clear visual separation between entries, matching the viewer's blocks.
    const formatSessionLog = (text) => {
        if (!text) return '';
        // Replace every ##CLR:...## with a blank-line sentinel FIRST, then strip the token.
        // This is more reliable than searching for [Log]/[Warning] keywords.
        const withSentinels = text.replace(/##CLR:[0-9A-Fa-f]{6}##/g, '\n\n\u0000');
        // Strip the sentinel placeholder but keep the double newline separator.
        const separated = withSentinels.replace(/\u0000/g, '');
        return separated
            .replace(/\n{3,}/g, '\n\n')   // Collapse any triple+ newlines to double
            .split('\n\n')
            .map(chunk => chunk.trim())
            .filter(chunk => chunk.length > 0)
            .join('\n\n')
            .trim();
    };

    // For the enhanced log: each new diagnostic entry in the C# output starts with
    // a fresh ##CLR:## token, then the [+] Category: line follows immediately.
    // After stripping, entries run together. We split on the ##CLR:## boundary AND
    // ensure a blank line before each literal "[+] Category:" line.
    const formatEnhancedLog = (text) => {
        if (!text) return '';
        // Split on colour code boundaries (same technique as raw log) so each
        // diagnostic entry gets its own paragraph.
        const withSentinels = text.replace(/##CLR:[0-9A-Fa-f]{6}##/g, '\n\n\u0000');
        const separated = withSentinels.replace(/\u0000/g, '');
        // Also guarantee a blank line directly before "[+] Category:" lines
        // in case any entries share a colour and didn't get a boundary above.
        // Note: the literal text is [+] so we escape the brackets in the regex.
        return separated
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\n(\[\+\] Category:)/g, '\n\n$1')
            .split('\n\n')
            .map(chunk => chunk.trim())
            .filter(chunk => chunk.length > 0)
            .join('\n\n')
            .trim();
    };

    // ── PER-TAB EXPORT STRATEGIES ─────────────────────────────────────────────

    if (currentActiveTarget === 'session-log') {
        // Raw Game Log — strip colour codes, add inter-block spacing
        content = formatSessionLog(loadedData.session_log);
        filename = "ARCHOTECH_RAW_GAME_LOG.txt";
    }

    else if (currentActiveTarget === 'enhanced-log') {
        // Enhanced Game Log — strip colour codes, preserve ALL metadata lines.
        // The [+] Category / [+] Diagnostic Note / [+] Identified Source /
        // [!] Suggested Action lines are already in the raw string — they were
        // never in the DOM in their raw form, hence innerText was missing them.
        const header =
            `ARCHOTECH ENHANCED GAME LOG\n${"=".repeat(60)}\n` +
            `Archotech Diagnostics — Enhanced Log Export\n` +
            `Color codes stripped. [+] = diagnostic note  [!] = suggested action\n` +
            `${"=".repeat(60)}\n\n`;
        content = header + formatEnhancedLog(loadedData.enhanced_log);
        filename = "ARCHOTECH_ENHANCED_LOG.txt";
    }

    else if (currentActiveTarget === 'trace-report') {
        // DS Trace Report — raw source only, no DOM scraping
        const header =
            `ARCHOTECH DS TRACE REPORT\n${"=".repeat(60)}\n` +
            `Deep Scan unidentified trace capture.\n` +
            `${"=".repeat(60)}\n\n`;
        content = header + formatEnhancedLog(loadedData.trace_report);
        filename = "ARCHOTECH_DS_TRACE_REPORT.txt";
    }

    else if (currentActiveTarget === 'player-log') {
        // Unity Engine Log — already stored as plain text (no colour codes)
        content = loadedData.player_log || '';
        if (!content) content = document.getElementById('player-log').innerText;
        filename = "ARCHOTECH_PLAYER_LOG.txt";
    }

    else if (currentActiveTarget === 'ai-json') {
        const raw = loadedData.ai_diagnostic;
        content = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
        filename = "ARCHOTECH_AI_DIAGNOSTICS.json";
        mimeType = "application/json";
    }

    else if (currentActiveTarget === 'perf-scan' && loadedData.perf_scan_data) {
        const json = typeof loadedData.perf_scan_data === 'string'
            ? JSON.parse(loadedData.perf_scan_data)
            : loadedData.perf_scan_data;

        const scanSec = json.TotalRuntime || 1;
        const SEP = "-".repeat(60);

        content  = `ARCHOTECH PERFORMANCE SCAN REPORT\n${"=".repeat(60)}\n`;
        content += `Total Scan Duration : ${json.TotalRuntime.toFixed(1)} s\n`;
        content += `Total Records       : ${json.Records.length}\n`;

        // Global health warnings
        if (json.GCPerSec > 1.0)
            content += `\n⚠  MEMORY HEMORRHAGE — GC pressure: ${json.GCPerSec.toFixed(2)} collections/sec\n`;
        if (json.WorldPawnCount >= 1500)
            content += `\n⚠  WORLD PAWN BLOAT — ${json.WorldPawnCount} background world pawns tracked.\n`;
        if (json.ActiveMapFilthCount > 2000)
            content += `\n⚠  ACTIVE MAP BLOAT — ${json.ActiveMapFilthCount} filth items on current map.\n`;
        if (json.TaleCount > 500)
            content += `\n⚠  HISTORY BLOAT — ${json.TaleCount} art/social tales in memory.\n`;

        content += `\n${"=".repeat(60)}\n\n`;

        json.Records.forEach(r => {
            const cpu = (scanSec > 0)
                ? ((r.TotalMs || 0) / (scanSec * 1000) * 100).toFixed(1)
                : "0.0";

            content += `${SEP}\n`;
            content += `[${(r.Score || 'NOMINAL').toUpperCase().padEnd(8)}]  ${r.ModName}\n`;
            content += `${SEP}\n`;
            content += `  Code Speed          : ${(r.MsPerTick || 0).toFixed(3)} ms/tick\n`;
            content += `  Real-Time CPU Load  : ${cpu}%\n`;
            content += `  Highest Spike       : ${(r.SpikeMs || 0).toFixed(2)} ms\n`;

            if (r.RamKbSec > 1.0)
                content += `  Memory Allocation   : ${r.RamKbSec.toFixed(0)} KB/sec\n`;

            if (r.DiagnosisTags && r.DiagnosisTags.length > 0) {
                const tags = r.DiagnosisTags.map(tk => trans[`KK_AD_${tk}`] || tk).join(", ");
                content += `  Diagnoses           : ${tags}\n`;
            } else {
                content += `  Diagnoses           : No active bottlenecks detected.\n`;
            }

            if (r.AccompliceString)
                content += `  Accomplices         : ${r.AccompliceString}\n`;
            if (r.ActiveCulprit)
                content += `  Primary Culprit     : ${r.ActiveCulprit}${r.DefName ? ` (${r.DefName})` : ''}\n`;

            if (r.HasDevData) {
                content += `  ── Developer Readout ─────────────────────────\n`;
                content += `  Assets              : ${(r.DevSizeMB || 0).toFixed(1)} MB\n`;
                content += `  XML Defs            : ${r.DevDefCount || 0}\n`;
                content += `  Harmony Patches     : ${r.DevPatchCount || 0}\n`;
                if ((r.DevVRAMMB || 0) > 0)
                    content += `  GPU VRAM Load       : ${r.DevVRAMMB.toFixed(1)} MB\n`;
            }

            if (r.TopMethods && r.TopMethods.length > 0) {
                content += `  ── Method Trace ──────────────────────────────\n`;
                r.TopMethods.forEach(m => {
                    const ram = m.AllocKb > 0 ? `  [${m.AllocKb.toFixed(1)} KB alloc]` : '';
                    content += `    »  ${m.Type}.${m.Method}: ${m.TimeMs.toFixed(2)} ms${ram}\n`;
                });
            }

            content += '\n';
        });

        filename = "ARCHOTECH_PERFORMANCE_REPORT.txt";
    }

    else if (currentActiveTarget === 'load-time' && loadedData.load_time_data) {
        const json = typeof loadedData.load_time_data === 'string'
            ? JSON.parse(loadedData.load_time_data)
            : loadedData.load_time_data;

        const totalSec = json.TotalGameLoadTime || 0;
        const impacts  = json.Impacts || [];
        const modSec   = impacts.reduce((s, m) => s + (m.TimeMs || 0), 0) / 1000;

        content  = `ARCHOTECH LOAD TIME DIAGNOSTICS\n${"=".repeat(60)}\n`;
        content += `Total Boot Duration  : ${totalSec.toFixed(2)} s\n`;
        content += `Mod Processing Time  : ${modSec.toFixed(2)} s\n`;
        content += `Core Engine Time     : ${Math.max(0, totalSec - modSec).toFixed(2)} s (estimated)\n`;
        content += `${"=".repeat(60)}\n\n`;

        impacts.forEach((m, i) => {
            const isLudeon = (m.PackageId || '').toLowerCase().startsWith('ludeon.');
            content += `${"-".repeat(60)}\n`;
            content += `#${(i + 1).toString().padStart(3)}  ${m.Name}${isLudeon ? '  [Core/DLC]' : ''}\n`;
            content += `${"-".repeat(60)}\n`;
            content += `  Measured Load Time : ${((m.TimeMs || 0) / 1000).toFixed(2)} s\n`;
            content += `  Asset Files        : ${m.AssetCount || 0} (${(m.AssetSizeMB || 0).toFixed(1)} MB)\n`;
            content += `  XML Definitions    : ${m.XmlCount || 0}\n`;
            content += `  C# Type Injection  : ${m.TypeCount || 0}\n\n`;
        });

        filename = "ARCHOTECH_LOAD_REPORT.txt";
    }

    else if (currentActiveTarget === 'mod-list' && myModsCache.length > 0) {
        content  = `ARCHOTECH MOD LIST MANIFEST\n${"=".repeat(80)}\n`;
        content += `Total Mods Installed : ${myModsCache.length}\n`;
        content += `Scan Date           : ${new Date().toLocaleString()}\n`;
        content += `${"=".repeat(80)}\n\n`;
        
        // Write each mod as its own block so version strings never get truncated.
        // A fixed-column ASCII table cuts off long version lists (e.g. "1.3, 1.4, 1.5, 1.6"),
        // so we use a labelled multi-line record layout instead.
        content += `${"─".repeat(100)}\n`;

        myModsCache.forEach((m, i) => {
            const num    = (i + 1).toString().padStart(3);
            const status = m.updateStatus === 'outdated' ? 'Needs Update'
                         : m.updateStatus === 'updated'  ? 'Up to Date'
                         : 'Local';
            // Use the full versions string — never truncate
            const ver    = m.versions || m.version || 'Unknown';
            const id     = m.packageId || 'unknown.id';
            const author = m.authors || 'Unknown';

            content += `#${num}  ${m.name || 'Unknown Mod'}\n`;
            content += `     Status  : ${status}\n`;
            content += `     Version : ${ver}\n`;
            content += `     Pack ID : ${id}\n`;
            content += `     Author  : ${author}\n`;
            content += `${"─".repeat(100)}\n`;
        });

        content += `\nLegend: Up to Date = Local matches Steam  |  Needs Update = Steam has newer version  |  Local = No Steam data / Local mod\n`;

        filename = "ARCHOTECH_MOD_LIST.txt";
    }

    else {
        // Generic fallback for any unhandled tab
        content = document.getElementById(currentActiveTarget)?.innerText || '';
    }

    return { content, filename, mimeType };
}

function toggleHelp(event) {
    if (event) event.stopPropagation();
    document.getElementById('help-panel').classList.toggle('open');
}

// Mirrors PerformanceScannerInfoWindow diagnosis legend exactly.
// Called once after translations are loaded.
function buildDiagnosisLegend() {
    const container = document.getElementById('diagnosis-legend-container');
    if (!container || typeof PERF_TAG_COLORS === 'undefined') return;

    const trans = archotechTranslations;

    // All diagnosis tag keys with their label/tip localization pairs
    const tags = [
        { key: 'CognitiveOverload',    label: 'KK_AD_CognitiveOverload',    tip: 'KK_AD_CognitiveOverloadTip' },
        { key: 'BiologicalBloat',      label: 'KK_AD_BiologicalBloat',      tip: 'KK_AD_BiologicalBloatTip' },
        { key: 'EntityChoke',          label: 'KK_AD_EntityChoke',           tip: 'KK_AD_EntityChokeTip' },
        { key: 'VisualHemorrhage',     label: 'KK_AD_VisualHemorrhage',      tip: 'KK_AD_VisualHemorrhageTip' },
        { key: 'DiagnosticHemorrhage', label: 'KK_AD_DiagnosticHemorrhage',  tip: 'KK_AD_DiagnosticHemorrhageTip' },
        { key: 'FrameworkBurden',      label: 'KK_AD_FrameworkBurden',       tip: 'KK_AD_FrameworkBurdenTip' },
        { key: 'VanillaLimits',        label: 'KK_AD_VanillaLimits',         tip: 'KK_AD_VanillaLimitsTip' },
        { key: 'HyperactiveLoop',      label: 'KK_AD_HyperactiveLoop',       tip: 'KK_AD_HyperactiveLoopTip' },
        { key: 'ParasiticLoad',        label: 'KK_AD_ParasiticLoad',         tip: 'KK_AD_ParasiticLoadTip' },
        { key: 'ModConflict',          label: 'KK_AD_ModConflict',           tip: 'KK_AD_ModConflictTip' },
    ];

    container.innerHTML = tags.map(t => {
        const color   = PERF_TAG_COLORS[t.key] || '#ffffff';
        const label   = trans[t.label] || t.key;
        const tipText = trans[t.tip]   || '';
        const r = parseInt(color.slice(1,3),16), g = parseInt(color.slice(3,5),16), b = parseInt(color.slice(5,7),16);
        const bg = `rgba(${r},${g},${b},0.20)`;
        return `
            <div style="margin-bottom:12px;">
                <div style="display:inline-flex; align-items:center; justify-content:center;
                             width:120px; height:20px; border:1px solid ${color}; background:${bg};
                             color:${color}; font-size:10px; font-weight:bold; text-transform:uppercase;
                             letter-spacing:0.3px; margin-bottom:4px;">${label}</div>
                <div style="font-size:11px; color:#999; line-height:1.4; padding-left:2px;">${tipText}</div>
            </div>`;
    }).join('');
}

document.addEventListener('click', e => {
    const panel = document.getElementById('help-panel');
    if (panel && panel.classList.contains('open') && !panel.contains(e.target)) panel.classList.remove('open');
});

/* ── MOD COMPARISON LOGIC ────────────────────────────────────────────────── */
function onModSearch() { currentSearchTerm = document.getElementById('mod-search-input').value.toLowerCase(); setCompareFilter(currentCompareFilter); }
function toggleCompareMode() {
    isCompareMode = true;
    document.getElementById('toggle-compare-btn').classList.add('hidden');
    ['close-compare-btn', 'share-compare-btn', 'compare-actions', 'compare-filters', 'right-mod-header', 'mod-list-right'].forEach(id => document.getElementById(id).classList.remove('hidden'));
    setCompareFilter(currentCompareFilter);
}
function closeCompareMode() {
    isCompareMode = false;
    document.getElementById('toggle-compare-btn').classList.remove('hidden');
    ['close-compare-btn', 'share-compare-btn', 'compare-actions', 'compare-filters', 'right-mod-header', 'mod-list-right'].forEach(id => document.getElementById(id).classList.add('hidden'));
    setCompareFilter(currentCompareFilter);
}
function setUpdateFilter(filter) {
    if (currentUpdateFilter === filter) filter = 'all';
    currentUpdateFilter = filter;
    document.querySelectorAll('[data-upfilter]').forEach(btn => btn.classList.toggle('active', btn.dataset.upfilter === filter));
    setCompareFilter(currentCompareFilter);
}
function setCompareFilter(filterParam) {
    if (currentCompareFilter === filterParam && filterParam !== 'all') filterParam = 'all';
    currentCompareFilter = filterParam;
    ['all', 'shared', 'left', 'right'].forEach(f => {
        const btn = document.getElementById(f === 'all' ? 'filter-all-mods' : f === 'shared' ? 'filter-shared-mods' : f === 'left' ? 'filter-unique-left' : 'filter-unique-right');
        if (btn) btn.classList.toggle('active', f === filterParam);
    });
    let fMine = myModsCache, fTheirs = theirModsCache;
    if (isCompareMode && theirModsCache.length > 0) {
        const mIds = new Set(myModsCache.map(m => m.packageId.toLowerCase()));
        const tIds = new Set(theirModsCache.map(m => m.packageId.toLowerCase()));
        if (filterParam === 'shared') { fMine = myModsCache.filter(m => tIds.has(m.packageId.toLowerCase())); fTheirs = theirModsCache.filter(m => mIds.has(m.packageId.toLowerCase())); }
        else if (filterParam === 'left') { fMine = myModsCache.filter(m => !tIds.has(m.packageId.toLowerCase())); fTheirs = []; }
        else if (filterParam === 'right') { fMine = []; fTheirs = theirModsCache.filter(m => !mIds.has(m.packageId.toLowerCase())); }
    }
    if (currentUpdateFilter !== 'all') { const upF = m => m.updateStatus === currentUpdateFilter; fMine = fMine.filter(upF); fTheirs = fTheirs.filter(upF); }
    if (currentSearchTerm) { const search = m => m.name.toLowerCase().includes(currentSearchTerm) || m.packageId.toLowerCase().includes(currentSearchTerm); fMine = fMine.filter(search); fTheirs = fTheirs.filter(search); }
    renderModTableBody(fMine, 'mod-table-body'); renderModTableBody(fTheirs, 'mod-table-body-compare');
}

async function fetchCompareData() {
    const urlInput = document.getElementById('compare-url').value.trim();
    if (!urlInput) return;
    let gistId = urlInput.match(/[a-zA-Z0-9]{20,}/) ? urlInput.match(/[a-zA-Z0-9]{20,}/)[0] : urlInput;
    currentCompareGistId = gistId;
    document.getElementById('compare-loading').classList.remove('hidden');
    try {
        const response = await fetch(`https://api.github.com/gists/${gistId}`);
        const data = await response.json();
        if (data.files && data.files["MOD_LIST.json"]) {
            const modsContent = data.files["MOD_LIST.json"].content;
            theirModsCache = (typeof modsContent === 'string' ? JSON.parse(modsContent) : modsContent).activeMods;
            await fetchSteamUpdates(theirModsCache);
        }
        document.getElementById('compare-loading').classList.add('hidden');
        document.getElementById('mod-table-compare-wrapper').classList.remove('hidden');
        setCompareFilter(currentCompareFilter);
    } catch (err) { console.error(err); }
}

function shareComparison() {
    if (!baseGistId || !currentCompareGistId) { alert("Baseline or Compared Gist missing."); return; }
    const shareUrl = new URL(window.location.href.split('?')[0]);
    shareUrl.searchParams.set('id', baseGistId);
    shareUrl.searchParams.set('compare', currentCompareGistId);
    shareUrl.searchParams.set('tab', 'mod-list');
    navigator.clipboard.writeText(shareUrl.toString()).then(() => {
        const btn = document.getElementById('share-compare-btn');
        const oldText = btn.innerHTML;
        btn.innerText = "COPIED!";
        setTimeout(() => btn.innerHTML = oldText, 2000);
    });
}

/* ── STEAM PROXY ───────────────────────────────────────────────────────────── */
async function fetchSteamUpdates(activeMods) {
    // SECURITY: Do not fetch Steam metadata if we are in Local mode unless specifically necessary.
    // (Existing logic: fetching is fine as we want update dots even locally)
    const steamIds = activeMods.map(m => String(m.steamId)).filter(id => id && id !== "null" && id.length > 5);
    if (steamIds.length === 0) return;

    try {
        const response = await fetch('https://dry-sound-5694archotech-log-proxy.kongkim-cdb.workers.dev/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(steamIds)
        });

        if (!response.ok) return;
        const steamData = await response.json();

        activeMods.forEach(mod => {
            mod.updateStatus = 'unknown';
            if (mod.steamId && steamData[mod.steamId]) {
                const entry = steamData[mod.steamId];
                if (typeof entry === 'object') {
                    if (entry.url) mod.previewUrl = entry.url;
                    if (mod.localTime && entry.time) {
                        mod.updateStatus = (entry.time > (mod.localTime + 86400)) ? 'outdated' : 'updated';
                    }
                } else if (mod.localTime) {
                    mod.updateStatus = (entry > (mod.localTime + 86400)) ? 'outdated' : 'updated';
                }
            }
        });

        // REFRESH: Instantly update all visible images with the newly acquired Steam URLs
        document.querySelectorAll('.mod-preview').forEach(img => {
            const id = img.getAttribute('data-steam-id');
            const m = activeMods.find(mod => String(mod.steamId) === id);
            if (m && m.previewUrl && img.src !== m.previewUrl) {
                img.style.opacity = '0';
                img.src = m.previewUrl;
                img.onload = () => img.style.opacity = '1';
            }
        });
    } catch (e) {
        console.warn("[Archotech] Steam Proxy fetch failed, falling back to manual scraping.", e);
    }
}

const handleImageError = async (img, label) => {
    // If we've already tried everything, show the clinical placeholder
    if (img.dataset.triedAll) {
        const container = img.closest('.preview-container'); 
        if (container) container.innerHTML = `<div class='no-preview'>${label}</div>`;
        return;
    }

    const steamId = img.getAttribute('data-steam-id');
    if (steamId && steamId !== 'null') {
        img.dataset.triedAll = 'true';
        
        // Strategy A: Construction (Fastest but probabilistic)
        // Construction of direct Steam CDN URLs is unreliable due to hashed filenames.
        
        // Strategy B: Scrape (Slower but accurate)
        try {
            const res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://steamcommunity.com/sharedfiles/filedetails/?id=' + steamId)}`);
            if (res.ok) {
                const html = await res.text(); 
                const match = html.match(/id="previewImageMain"[^>]+src="([^"]+)"/);
                if (match) { 
                    img.src = match[1]; 
                    return; 
                }
            }
        } catch (e) { }
    }
    
    // Final Fallback: Clinical Placeholder
    const container = img.closest('.preview-container'); 
    if (container) container.innerHTML = `<div class='no-preview'>${label}</div>`;
};

/* ── GIST 2.0 PIPELINE HELPERS ─────────────────────────────────────────────── */

/**
 * THE STITCHER — reassembles chunked Gist files.
 * If a logical file was split into "NAME_part1.txt", "NAME_part2.txt", … this
 * function concatenates them in order and returns a clean {name → content} map
 * with the synthetic part files removed.
 *
 * @param   {Object} files  Raw Gist files object from the GitHub API.
 * @returns {Object}        Cleaned map with parts assembled.
 */
function stitchParts(files) {
    const result = {};
    const partMap = {}; // baseName → { index → content }

    for (const [filename, fileObj] of Object.entries(files)) {
        const content = fileObj?.content ?? fileObj ?? '';
        // Match pattern: BASENAME_partN.EXT  (e.g. ENHANCED_RAW_LOG_part2.txt)
        const m = filename.match(/^(.+?)_part(\d+)(\.[^.]+)?$/);
        if (m) {
            const base = m[1] + (m[3] || '');
            const idx  = parseInt(m[2], 10);
            if (!partMap[base]) partMap[base] = {};
            partMap[base][idx] = content;
        } else {
            result[filename] = content;
        }
    }

    // Reassemble each chunked file in ascending part order
    for (const [base, parts] of Object.entries(partMap)) {
        const sorted = Object.keys(parts)
            .map(Number)
            .sort((a, b) => a - b);
        result[base] = sorted.map(i => parts[i]).join('');
    }

    return result;
}

/**
 * DECOMPRESSOR — detects and inflates a GZip+Base64 encoded string.
 * If the string is valid Base64 and pako is available it is decompressed;
 * otherwise it is returned as-is (backward-compatible with old plain-text Gists).
 *
 * @param   {string} str  Raw content string from a Gist file.
 * @returns {string}      Decompressed UTF-8 string, or the original string.
 */
function decodeAndDecompress(str) {
    if (!str || typeof str !== 'string') return str;

    // Detect Base64: only A-Z, a-z, 0-9, +, /, = (no spaces, no ## colour codes)
    const isBase64 = /^[A-Za-z0-9+/]+=*$/.test(str.trim()) && !str.includes('\n');
    if (!isBase64) return str; // plain text payload — return as-is

    if (typeof pako === 'undefined') {
        console.warn('[Archotech] pako not loaded — cannot decompress GZip payload. Returning raw Base64.');
        return str;
    }

    try {
        const binaryStr = atob(str.trim());
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        return pako.inflate(bytes, { to: 'string' });
    } catch (e) {
        console.warn('[Archotech] GZip decompression failed, treating as plain text.', e);
        return str;
    }
}

/**
 * ENCYCLOPEDIA MAPPER — traverses a data object/string and substitutes
 * any string value that is a known encyclopedia key with its full text.
 *
 * Resolution order:
 *   1. archotechEncyclopedia[value] → the mapped key string (e.g. "KK_AD_IssueExpl_NullRef")
 *   2. archotechTranslations[mappedKey] → the human-readable translated string
 *   3. If only step 1 succeeds → return the KK_AD_ key (translations may arrive later)
 *   4. No match → return original value unchanged.
 *
 * @param   {*} data  Any JSON-parsed value.
 * @returns {*}       The same structure with encyclopedia values substituted.
 */
function applyEncyclopedia(data) {
    if (!data || !Object.keys(archotechEncyclopedia).length) return data;

    if (typeof data === 'string') {
        const mapped = archotechEncyclopedia[data];
        if (!mapped) return data;
        // mapped is a KK_AD_ key — resolve it through translations if possible
        return archotechTranslations[mapped] || mapped;
    }

    if (Array.isArray(data)) {
        return data.map(item => applyEncyclopedia(item));
    }

    if (typeof data === 'object' && data !== null) {
        const out = {};
        for (const [k, v] of Object.entries(data)) {
            out[k] = applyEncyclopedia(v);
        }
        return out;
    }

    return data;
}

/* ── BOOTLOADER ────────────────────────────────────────────────────────────── */
async function init() {
    // ── Phase 0: Load static Encyclopedia before anything else ──────────────
    await loadEncyclopedia();

    const i18nDict = window.archotechLocalData ? window.archotechLocalData["I18N_DICT.json"] : null;
    if (i18nDict) {
        archotechTranslations = JSON.parse(i18nDict);
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const k = el.getAttribute('data-i18n');
            if (archotechTranslations[k]) {
                if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
                    el.placeholder = archotechTranslations[k];
                } else {
                    el.innerHTML = archotechTranslations[k];
                }
            }
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const gistId = urlParams.get('id'); baseGistId = gistId; urlTab = urlParams.get('tab'); urlCompareId = urlParams.get('compare');

    if (gistId) {
        statusText.innerText = "Accessing Cloud Archive...";
        try {
            const response = await fetch(`https://api.github.com/gists/${gistId}`);
            const data = await response.json();
            if (data.files) {
                // ── Phase 1: Stitch chunked part files back into whole files ──
                const stitched = stitchParts(data.files);

                // ── Phase 2: Decompress each file (GZip+Base64 → plain text) ──
                const decompress = (key) => decodeAndDecompress(stitched[key] ?? '');

                loadedData.ai_diagnostic  = decompress("AI_DIAGNOSTICS.json");
                loadedData.enhanced_log   = decompress("ENHANCED_RAW_LOG.txt");
                loadedData.session_log    = decompress("SESSION_LOG_DUMP.txt");
                loadedData.trace_report   = decompress("UNKNOWN_TRACE_REPORT.txt");
                loadedData.mod_list       = decompress("MOD_LIST.json");
                loadedData.player_log     = decompress("Player.log") || null;
                loadedData.load_time_data = decompress("LOAD_TIME_DATA.json");
                loadedData.perf_scan_data = decompress("PERF_SCAN_DATA.json");
                loadedData.color_legend   = decompress("COLOR_LEGEND_HTML.txt");

                // ── Phase 3: Load translations (also compressed) ──────────────
                const i18nRaw = decompress("I18N_DICT.json");
                if (i18nRaw) {
                    try { archotechTranslations = JSON.parse(i18nRaw); } catch (_) {}
                }

                // ── Phase 4: Apply Encyclopedia mapping to structured JSON data ─
                // Text files (logs) are resolved inline by the renderer which reads
                // archotechTranslations. Only structured JSON objects need the deep map.
                if (loadedData.ai_diagnostic) {
                    try {
                        const parsed = JSON.parse(loadedData.ai_diagnostic);
                        loadedData.ai_diagnostic = JSON.stringify(applyEncyclopedia(parsed), null, 2);
                    } catch (_) { /* not valid JSON, leave as-is */ }
                }
                if (loadedData.perf_scan_data) {
                    try {
                        const parsed = JSON.parse(loadedData.perf_scan_data);
                        loadedData.perf_scan_data = applyEncyclopedia(parsed);
                    } catch (_) { /* leave as-is */ }
                }
                if (loadedData.load_time_data) {
                    try {
                        const parsed = JSON.parse(loadedData.load_time_data);
                        loadedData.load_time_data = applyEncyclopedia(parsed);
                    } catch (_) { /* leave as-is */ }
                }
            }

            // Extract the exact creation time directly from the GitHub Gist metadata
            let exportTime = gistId;
            if (data.created_at) {
                exportTime = new Date(data.created_at).toLocaleString();
            }

            statusText.innerText = `Online Diagnostic Record - ${exportTime}`;
            
            document.getElementById('online-notice').classList.remove('hidden');
            await renderData();
            buildDiagnosisLegend();
        } catch (e) { statusText.innerText = "Linkage Error"; console.error('[Archotech] init error:', e); }
    } else if (window.archotechLocalData) {
        // Extract the timestamp injected directly by ExportManager.cs
        let exportTime = "Connected";
        if (window.archotechLocalData._timestamp) {
            exportTime = new Date(window.archotechLocalData._timestamp).toLocaleString();
        }

        statusText.innerText = `Local Diagnostic Record - ${exportTime}`;
        // Local data.js payloads are NOT compressed (written directly by C# to disk).
        // Apply encyclopedia mapping to structured JSON for consistency.
        const keys = { "AI_DIAGNOSTICS.json": "ai_diagnostic", "ENHANCED_RAW_LOG.txt": "enhanced_log", "SESSION_LOG_DUMP.txt": "session_log", "UNKNOWN_TRACE_REPORT.txt": "trace_report", "MOD_LIST.json": "mod_list", "Player.log": "player_log", "LOAD_TIME_DATA.json": "load_time_data", "PERF_SCAN_DATA.json": "perf_scan_data", "COLOR_LEGEND_HTML.txt": "color_legend" };
        Object.entries(keys).forEach(([f, k]) => { loadedData[k] = window.archotechLocalData[f]; });

        // Apply encyclopedia to local structured data too
        for (const key of ['perf_scan_data', 'load_time_data']) {
            if (loadedData[key] && typeof loadedData[key] === 'string') {
                try { loadedData[key] = applyEncyclopedia(JSON.parse(loadedData[key])); } catch (_) {}
            } else if (loadedData[key] && typeof loadedData[key] === 'object') {
                loadedData[key] = applyEncyclopedia(loadedData[key]);
            }
        }

        await renderData();
        buildDiagnosisLegend();
    }

    if (urlCompareId) { document.getElementById('compare-url').value = urlCompareId; toggleCompareMode(); fetchCompareData(); }
}

window.addEventListener('DOMContentLoaded', init);
