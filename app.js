// Application Coordinator for CSV Dataflow Admin Console Processor
// v3.0.0 - Multi-School Weekly Processor & Multi-Tab Excel Summary Ledger
// Supports multi-school content dumps, domain-based school name & extension extraction,
// weekly tabs system, per-school clean downloads, and multi-tab SheetJS Excel export.

// ==========================================
// Application State
// ==========================================
let uploadedFiles = [];
let worker = null;
let masterBlobUrl = null;
let currentBatchSchools = []; // Schools detected in current batch
let detectedActions = []; // Dynamically detected action values from CSV

const WEEKLY_STORAGE_KEY = 'dataflow_weekly_school_records_v1';
const LEGACY_STORAGE_KEY = 'dataflow_school_records_v1';

let weeklyRecords = loadWeeklyRecords();
let activeWeekRange = getInitialActiveWeek();

// ==========================================
// UI Elements
// ==========================================
// Sidebar Upload & Mapping
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');

const weekDateRangeInput = document.getElementById('weekDateRangeInput');
const clearWeekRangeBtn = document.getElementById('clearWeekRangeBtn');
const btnPresetThisWeek = document.getElementById('btnPresetThisWeek');
const btnPresetLastWeek = document.getElementById('btnPresetLastWeek');

const dropdownTrigger = document.getElementById('dropdownTrigger');
const dropdownMenu = document.getElementById('dropdownMenu');
const selectedActionsText = document.getElementById('selectedActionsText');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const actionItemsContainer = document.getElementById('actionItemsContainer');
const processBtn = document.getElementById('processBtn');
const resetBtn = document.getElementById('resetBtn');
const nextBatchBtn = document.getElementById('nextBatchBtn');
const downloadBtn = document.getElementById('downloadBtn');

// Dashboard Stats
const statFiles = document.getElementById('statFiles');
const statProcessed = document.getElementById('statProcessed');
const statFiltered = document.getElementById('statFiltered');
const statClean = document.getElementById('statClean');
const statSchools = document.getElementById('statSchools');

// Progress & Console
const progressBanner = document.getElementById('progressBanner');
const progressStatusText = document.getElementById('progressStatusText');
const progressPercentText = document.getElementById('progressPercentText');
const progressBarFill = document.getElementById('progressBarFill');
const consolePanel = document.getElementById('consolePanel');

// Current Batch School Breakdown
const currentBatchCard = document.getElementById('currentBatchCard');
const currentBatchSubtitle = document.getElementById('currentBatchSubtitle');
const currentSchoolsGrid = document.getElementById('currentSchoolsGrid');
const downloadAllCombinedBtn = document.getElementById('downloadAllCombinedBtn');

// Preview Table
const previewTable = document.getElementById('previewTable');
const previewTableBody = document.getElementById('previewTableBody');
const previewPlaceholder = document.getElementById('previewPlaceholder');

// Weekly School Records Ledger
const ledgerCard = document.getElementById('ledgerCard');
const weekTabsBar = document.getElementById('weekTabsBar');
const ledgerActiveWeekDisplay = document.getElementById('ledgerActiveWeekDisplay');
const ledgerSchoolsCount = document.getElementById('ledgerSchoolsCount');
const ledgerTotalCount = document.getElementById('ledgerTotalCount');
const ledgerTable = document.getElementById('ledgerTable');
const ledgerTableBody = document.getElementById('ledgerTableBody');
const ledgerPlaceholder = document.getElementById('ledgerPlaceholder');
const ledgerPlaceholderText = document.getElementById('ledgerPlaceholderText');

const addNewWeekBtn = document.getElementById('addNewWeekBtn');
const addManualRecordBtn = document.getElementById('addManualRecordBtn');
const downloadRecordExcelBtn = document.getElementById('downloadRecordExcelBtn');
const clearWeekRecordsBtn = document.getElementById('clearWeekRecordsBtn');
const clearAllRecordsBtn = document.getElementById('clearAllRecordsBtn');

// Manual Add Modal
const manualRecordModal = document.getElementById('manualRecordModal');
const closeManualModalBtn = document.getElementById('closeManualModalBtn');
const cancelManualRecordBtn = document.getElementById('cancelManualRecordBtn');
const saveManualRecordBtn = document.getElementById('saveManualRecordBtn');
const manualWeekRangeInput = document.getElementById('manualWeekRangeInput');
const manualSchoolNameInput = document.getElementById('manualSchoolNameInput');
const manualExtensionInput = document.getElementById('manualExtensionInput');
const manualUniqueCountInput = document.getElementById('manualUniqueCountInput');

// Create New Week Modal
const newWeekModal = document.getElementById('newWeekModal');
const closeNewWeekModalBtn = document.getElementById('closeNewWeekModalBtn');
const cancelNewWeekBtn = document.getElementById('cancelNewWeekBtn');
const confirmNewWeekBtn = document.getElementById('confirmNewWeekBtn');
const newWeekRangeInput = document.getElementById('newWeekRangeInput');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // If no week range is filled, prefill with default week range
    if (!weekDateRangeInput.value.trim()) {
        weekDateRangeInput.value = getWeekDateRangeString(0);
        clearWeekRangeBtn.style.display = 'block';
    }

    renderWeeklyTabs();
    renderWeeklyLedger();
});

// ==========================================
// Storage & Migration Helpers
// ==========================================
function loadWeeklyRecords() {
    try {
        const raw = localStorage.getItem(WEEKLY_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }

        // Migrate legacy single-school records if available
        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
            const legacyRecords = JSON.parse(legacyRaw);
            if (Array.isArray(legacyRecords) && legacyRecords.length > 0) {
                const migratedWeek = {
                    weekRange: 'Previous Records',
                    createdAt: new Date().toISOString(),
                    schools: legacyRecords.map(r => ({
                        id: r.id || 'sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                        schoolName: r.schoolName || 'Unknown School',
                        extension: r.extension || '@unknown.gov.in',
                        uniqueCount: r.uniqueCount || 0,
                        csvContent: r.csvContent || null
                    }))
                };
                const migrated = [migratedWeek];
                saveWeeklyRecords(migrated);
                return migrated;
            }
        }
    } catch (e) {
        console.error('Failed to load weekly records from storage', e);
    }
    return [];
}

function saveWeeklyRecords(data) {
    try {
        localStorage.setItem(WEEKLY_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('Failed to save weekly records to storage', e);
        showToast('Storage quota warning: unable to save large record sets locally.', 'error');
    }
}

function getInitialActiveWeek() {
    if (weeklyRecords.length > 0) {
        return weeklyRecords[0].weekRange;
    }
    return weekDateRangeInput ? weekDateRangeInput.value.trim() : 'Current Week';
}

// ==========================================
// Date Formatting & Presets
// ==========================================
function getOrdinalSuffix(day) {
    if (day > 3 && day < 21) return 'th';
    switch (day % 10) {
        case 1:  return 'st';
        case 2:  return 'nd';
        case 3:  return 'rd';
        default: return 'th';
    }
}

function formatOrdinalDate(date) {
    const day = date.getDate();
    const suffix = getOrdinalSuffix(day);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day}${suffix} ${month}`;
}

// Returns e.g. "31st Oct - 5th Nov" for week offset (0 = this week, -1 = last week)
function getWeekDateRangeString(offsetWeeks = 0) {
    const now = new Date();
    // Anchor to Monday of the target week
    const currentDay = now.getDay(); // 0 is Sun, 1 is Mon
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday + (offsetWeeks * 7));
    
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5); // 6-day academic / work week (Mon - Sat)

    return `${formatOrdinalDate(monday)} - ${formatOrdinalDate(saturday)}`;
}

// Quick Date Action buttons
btnPresetThisWeek.addEventListener('click', () => {
    const val = getWeekDateRangeString(0);
    weekDateRangeInput.value = val;
    clearWeekRangeBtn.style.display = 'block';
    showToast(`Week date range set to: ${val}`, 'info');
});

btnPresetLastWeek.addEventListener('click', () => {
    const val = getWeekDateRangeString(-1);
    weekDateRangeInput.value = val;
    clearWeekRangeBtn.style.display = 'block';
    showToast(`Week date range set to: ${val}`, 'info');
});

weekDateRangeInput.addEventListener('input', () => {
    clearWeekRangeBtn.style.display = weekDateRangeInput.value.trim() ? 'block' : 'none';
});

clearWeekRangeBtn.addEventListener('click', () => {
    weekDateRangeInput.value = '';
    clearWeekRangeBtn.style.display = 'none';
    weekDateRangeInput.focus();
});

// ==========================================
// File Upload & Drag-and-Drop Handling
// ==========================================
uploadZone.addEventListener('click', () => fileInput.click());

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-active');
});

uploadZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-active');
});

uploadZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-active');
    if (e.dataTransfer.files.length > 0) {
        await handleFilesSelected(Array.from(e.dataTransfer.files));
    }
});

fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
        await handleFilesSelected(Array.from(e.target.files));
    }
});

async function handleFilesSelected(newFiles) {
    const csvFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv') || f.type === 'text/plain');

    if (csvFiles.length === 0) {
        showToast('Only CSV log files are supported.', 'error');
        return;
    }

    // Merge without duplicates based on name and size
    csvFiles.forEach(file => {
        const exists = uploadedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!exists) {
            uploadedFiles.push(file);
        }
    });

    renderFileList();
    updateUploadStats();

    addConsoleLog(`Added ${csvFiles.length} file(s). Total uploaded: ${uploadedFiles.length}. Scanning action values...`, 'info');

    // Dynamically scan for Action values in the CSVs
    showActionScanningState(true);
    try {
        detectedActions = await scanForActionValues(uploadedFiles);
        renderActionFilterOptions(detectedActions);
        showActionScanningState(false);
    } catch (err) {
        console.error('Error scanning actions:', err);
        showActionScanningState(false);
    }

    const hasChecked = getActionCheckboxes().some(cb => cb.checked);
    processBtn.disabled = !hasChecked || uploadedFiles.length === 0;
}

function renderFileList() {
    fileList.innerHTML = '';
    if (uploadedFiles.length === 0) {
        return;
    }

    uploadedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.innerHTML = `
            <div class="file-item-info">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            </div>
            <div class="file-item-right">
                <span class="file-size">${formatBytes(file.size)}</span>
                <button type="button" class="file-remove" onclick="removeFileByIndex(${index})" title="Remove file">✕</button>
            </div>
        `;
        fileList.appendChild(item);
    });
}

window.removeFileByIndex = async function(index) {
    uploadedFiles.splice(index, 1);
    renderFileList();
    updateUploadStats();

    if (uploadedFiles.length > 0) {
        showActionScanningState(true);
        detectedActions = await scanForActionValues(uploadedFiles);
        renderActionFilterOptions(detectedActions);
        showActionScanningState(false);
    } else {
        detectedActions = [];
        renderActionFilterOptions([]);
        selectedActionsText.textContent = 'Upload CSV files to detect actions...';
    }

    const hasChecked = getActionCheckboxes().some(cb => cb.checked);
    processBtn.disabled = !hasChecked || uploadedFiles.length === 0;
};

function updateUploadStats() {
    statFiles.textContent = uploadedFiles.length;
}

// ==========================================
// Dynamic Action Detection from CSV Files
// ==========================================
function parseCSVLine(text) {
    const fields = [];
    let inQuote = false;
    let field = "";
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuote && text[i+1] === '"') {
                field += '"';
                i++;
            } else {
                inQuote = !inQuote;
            }
        } else if (char === ',' && !inQuote) {
            fields.push(field);
            field = "";
        } else {
            field += char;
        }
    }
    fields.push(field);
    return fields;
}

function detectActionColumnIndex(headers) {
    const exactKeywords = [
        'activity type', 'action', 'activity', 'event type', 'action name',
        'operation', 'event', 'type', 'permission'
    ];
    for (const kw of exactKeywords) {
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toLowerCase().trim();
            if (header === kw) {
                return i;
            }
        }
    }
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i].toLowerCase().trim();
        if (header.includes('time') || header.includes('date') || header.includes('id') || header.includes('user') || header.includes('ip')) {
            continue;
        }
        for (const kw of ['activity', 'action', 'event', 'operation']) {
            if (header.includes(kw)) {
                return i;
            }
        }
    }
    return -1;
}

async function scanForActionValues(files) {
    const actionSet = new Set();
    
    for (const file of files) {
        const sampleSize = Math.min(file.size, 2 * 1024 * 1024);
        const slice = file.slice(0, sampleSize);
        const text = await readBlobAsText(slice);
        
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) continue;
        
        const headers = parseCSVLine(lines[0]);
        const actionColIdx = detectActionColumnIndex(headers);
        
        if (actionColIdx === -1) {
            addConsoleLog(`Could not detect action column in "${file.name}". Headers: ${headers.join(', ')}`, 'error');
            continue;
        }
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const fields = parseCSVLine(line);
            if (fields[actionColIdx]) {
                const actionVal = fields[actionColIdx].trim();
                if (actionVal && actionVal.length > 0) {
                    actionSet.add(actionVal);
                }
            }
        }
    }
    
    return Array.from(actionSet).sort();
}

function readBlobAsText(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

function showActionScanningState(isScanning) {
    if (isScanning) {
        selectedActionsText.textContent = 'Detecting actions from CSV...';
        dropdownTrigger.classList.add('disabled');
    } else {
        dropdownTrigger.classList.remove('disabled');
        updateSelectedActionsText();
    }
}

function renderActionFilterOptions(actions) {
    actionItemsContainer.innerHTML = '';
    
    if (actions.length === 0) {
        actionItemsContainer.innerHTML = `<div style="padding: 0.5rem 0.75rem; color: var(--text-muted); font-size: 0.8rem;">No actions detected yet.</div>`;
        selectAllCheckbox.checked = false;
        selectAllCheckbox.disabled = true;
        updateSelectedActionsText();
        return;
    }

    selectAllCheckbox.disabled = false;

    // Default pre-select "Read", "Create", "Create with public Link"
    const defaultSelected = ['read', 'create', 'create with public link'];

    actions.forEach(act => {
        const isPreChecked = defaultSelected.includes(act.toLowerCase());
        const label = document.createElement('label');
        label.className = 'dropdown-item';
        label.innerHTML = `
            <input type="checkbox" class="action-checkbox" value="${escapeHtml(act)}" ${isPreChecked ? 'checked' : ''}>
            <span>${escapeHtml(act)}</span>
        `;
        
        const cb = label.querySelector('.action-checkbox');
        cb.addEventListener('change', () => {
            syncSelectAllCheckbox();
            updateSelectedActionsText();
            const hasChecked = getActionCheckboxes().some(c => c.checked);
            processBtn.disabled = !hasChecked || uploadedFiles.length === 0;
        });
        
        actionItemsContainer.appendChild(label);
    });

    syncSelectAllCheckbox();
    updateSelectedActionsText();
}

function getActionCheckboxes() {
    return Array.from(document.querySelectorAll('.action-checkbox'));
}

function syncSelectAllCheckbox() {
    const actionCheckboxes = getActionCheckboxes();
    if (actionCheckboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }
    const allChecked = actionCheckboxes.every(cb => cb.checked);
    const someChecked = actionCheckboxes.some(cb => cb.checked);
    selectAllCheckbox.checked = allChecked;
    selectAllCheckbox.indeterminate = !allChecked && someChecked;
}

function updateSelectedActionsText() {
    const actionCheckboxes = getActionCheckboxes();
    const checked = actionCheckboxes.filter(cb => cb.checked);
    
    if (actionCheckboxes.length === 0) {
        selectedActionsText.textContent = 'Upload CSV files to detect actions...';
    } else if (checked.length === 0) {
        selectedActionsText.textContent = 'No actions selected';
    } else if (checked.length === actionCheckboxes.length) {
        selectedActionsText.textContent = `All Actions Selected (${checked.length})`;
    } else {
        const names = checked.map(cb => cb.value).slice(0, 2).join(', ');
        const extra = checked.length > 2 ? ` +${checked.length - 2} more` : '';
        selectedActionsText.textContent = `${names}${extra}`;
    }
}

// ==========================================
// Process Files Pipeline
// ==========================================
processBtn.addEventListener('click', () => {
    if (uploadedFiles.length === 0) return;

    const actionCheckboxes = getActionCheckboxes();
    const actionValues = actionCheckboxes
        .filter(cb => cb.checked)
        .map(cb => cb.value)
        .join(', ');

    if (!actionValues) {
        addConsoleLog('No action filters selected. Please select at least one.', 'error');
        showToast('Please select at least one action filter.', 'error');
        return;
    }

    let weekRange = weekDateRangeInput.value.trim();
    if (!weekRange) {
        weekRange = getWeekDateRangeString(0);
        weekDateRangeInput.value = weekRange;
        clearWeekRangeBtn.style.display = 'block';
    }

    toggleInputs(true);
    
    progressBanner.style.display = 'block';
    progressStatusText.textContent = `Analyzing multi-school content dumps for "${weekRange}"...`;
    progressPercentText.textContent = '0%';
    progressBarFill.style.width = '0%';
    
    previewTable.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    currentBatchCard.style.display = 'none';
    downloadBtn.disabled = true;
    nextBatchBtn.disabled = true;

    if (masterBlobUrl) {
        URL.revokeObjectURL(masterBlobUrl);
        masterBlobUrl = null;
    }

    addConsoleLog(`Starting weekly multi-school analysis for week "${weekRange}" (${uploadedFiles.length} file(s))...`, 'info');
    addConsoleLog(`Active action filters: ${actionValues}`, 'info');

    worker = new Worker('parser-worker.js?v=3.0.0');

    worker.postMessage({
        files: uploadedFiles,
        emailColConfig: 'auto',
        actionColConfig: 'auto',
        actionValuesRaw: actionValues
    });

    worker.onmessage = function(e) {
        const { type, percent, fileName, rawRecords, matchingActions, cleanEmails, schoolsDetected, message, logLevel, data } = e.data;

        switch (type) {
            case 'PROGRESS':
                progressBarFill.style.width = `${percent}%`;
                progressPercentText.textContent = `${percent}%`;
                progressStatusText.textContent = `Parsing "${fileName}" [${percent}%]`;
                
                statProcessed.textContent = rawRecords.toLocaleString();
                statFiltered.textContent = matchingActions.toLocaleString();
                statClean.textContent = cleanEmails.toLocaleString();
                statSchools.textContent = (schoolsDetected || 0).toLocaleString();
                break;

            case 'LOG':
                addConsoleLog(message, logLevel, e.data.timestamp);
                break;

            case 'COMPLETE':
                addConsoleLog(`Finished processing! Detected ${data.schoolsList.length} school(s) with ${data.stats.finalCleanCount.toLocaleString()} grand unique clean emails.`, 'success');
                finishProcessing(data, weekRange);
                break;

            case 'ERROR':
                addConsoleLog(`Processing Error: ${message}`, 'error');
                showToast(`Processing error: ${message}`, 'error');
                handleWorkerFailure();
                break;
        }
    };

    worker.onerror = function(err) {
        addConsoleLog(`Worker thread failure: ${err.message}`, 'error');
        showToast('Worker thread error occurred.', 'error');
        handleWorkerFailure();
    };
});

function toggleInputs(disabled) {
    fileInput.disabled = disabled;
    weekDateRangeInput.disabled = disabled;
    btnPresetThisWeek.disabled = disabled;
    btnPresetLastWeek.disabled = disabled;
    selectAllCheckbox.disabled = disabled;
    const actionCheckboxes = getActionCheckboxes();
    actionCheckboxes.forEach(cb => cb.disabled = disabled);
    
    if (disabled) {
        dropdownTrigger.classList.add('disabled');
        dropdownMenu.style.display = 'none';
        dropdownTrigger.classList.remove('active');
    } else {
        dropdownTrigger.classList.remove('disabled');
    }
    
    processBtn.disabled = disabled;
    
    const removeButtons = document.querySelectorAll('.file-remove');
    removeButtons.forEach(btn => btn.disabled = disabled);

    if (disabled) {
        uploadZone.style.pointerEvents = 'none';
        uploadZone.style.opacity = '0.5';
    } else {
        uploadZone.style.pointerEvents = 'auto';
        uploadZone.style.opacity = '1';
    }
}

function handleWorkerFailure() {
    toggleInputs(false);
    progressBanner.style.display = 'none';
    if (worker) {
        worker.terminate();
        worker = null;
    }
}

function finishProcessing(result, weekRange) {
    progressBanner.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    progressBanner.style.background = 'rgba(16, 185, 129, 0.05)';
    progressStatusText.innerHTML = `<span style="color: var(--color-success); font-weight: 600;">Processing Finished (${result.schoolsList.length} schools detected for ${escapeHtml(weekRange)})</span>`;
    progressBarFill.style.width = '100%';
    progressPercentText.textContent = '100%';
    
    // Update Stats Board
    statFiles.textContent = result.stats.filesProcessed.toLocaleString();
    statProcessed.textContent = result.stats.totalRawRecords.toLocaleString();
    statFiltered.textContent = result.stats.totalMatchingActions.toLocaleString();
    statClean.textContent = result.stats.finalCleanCount.toLocaleString();
    statSchools.textContent = result.schoolsList.length.toLocaleString();

    // Render Preview Table
    renderPreviewTable(result.previewRows);

    // Save current batch schools & render breakdown card
    currentBatchSchools = result.schoolsList;
    renderCurrentSchoolsGrid(result.schoolsList, weekRange);

    // Set Master Combined CSV Blob
    const masterBlob = new Blob([result.masterCsvContent], { type: 'text/csv;charset=utf-8;' });
    masterBlobUrl = URL.createObjectURL(masterBlob);
    downloadBtn.disabled = false;
    nextBatchBtn.disabled = false;

    toggleInputs(false);
    const hasChecked = getActionCheckboxes().some(cb => cb.checked);
    processBtn.disabled = !hasChecked || uploadedFiles.length === 0;

    if (worker) {
        worker.terminate();
        worker = null;
    }

    // Auto-save/merge detected schools into the weekly ledger
    saveBatchSchoolsToWeek(weekRange, result.schoolsList);

    showToast(`Processed ${result.schoolsList.length} schools (${result.stats.finalCleanCount.toLocaleString()} clean emails) for ${weekRange}!`, 'success');
}

function renderPreviewTable(rows) {
    previewTableBody.innerHTML = '';
    if (!rows || rows.length === 0) {
        previewTable.style.display = 'none';
        previewPlaceholder.style.display = 'block';
        previewPlaceholder.querySelector('p').textContent = 'The filter yielded zero email records.';
        return;
    }

    rows.forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="row-index">${index + 1}</span></td>
            <td><strong>${escapeHtml(row.email)}</strong></td>
            <td><span style="color: #c084fc; font-weight: 600;">${escapeHtml(row.schoolName || 'Unknown')}</span></td>
            <td><span class="extension-badge">${escapeHtml(row.extension || '')}</span></td>
        `;
        previewTableBody.appendChild(tr);
    });

    previewPlaceholder.style.display = 'none';
    previewTable.style.display = 'table';
}

// ==========================================
// Current Batch Schools Breakdown Cards
// ==========================================
function renderCurrentSchoolsGrid(schools, weekRange) {
    currentSchoolsGrid.innerHTML = '';
    if (!schools || schools.length === 0) {
        currentBatchCard.style.display = 'none';
        return;
    }

    currentBatchCard.style.display = 'block';
    currentBatchSubtitle.textContent = `Detected ${schools.length} distinct school extension(s) in this week's content dump (${escapeHtml(weekRange)}).`;

    schools.forEach((sch, index) => {
        const card = document.createElement('div');
        card.className = 'school-batch-card';
        card.innerHTML = `
            <div class="school-batch-header">
                <div>
                    <div class="school-batch-name">${escapeHtml(sch.schoolName)}</div>
                    <div class="school-batch-ext">${escapeHtml(sch.extension)}</div>
                </div>
                <div class="school-batch-badge">${sch.uniqueCount.toLocaleString()}</div>
            </div>
            <div class="school-batch-footer">
                <span style="font-size: 0.72rem; color: var(--text-muted);">Unique clean emails</span>
                <button class="btn-download-school" onclick="downloadCurrentBatchSchoolCsv(${index})" title="Download CSV of clean emails for ${escapeHtml(sch.schoolName)}">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download CSV
                </button>
            </div>
        `;
        currentSchoolsGrid.appendChild(card);
    });
}

window.downloadCurrentBatchSchoolCsv = function(index) {
    const sch = currentBatchSchools[index];
    if (!sch || !sch.csvContent) {
        showToast('CSV content not available.', 'error');
        return;
    }
    const blob = new Blob([sch.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const sanitizedName = sch.schoolName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizedName}_unique_emails.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded clean emails for "${sch.schoolName}".`, 'success');
};

downloadAllCombinedBtn.addEventListener('click', () => {
    downloadMasterCsv();
});

downloadBtn.addEventListener('click', () => {
    downloadMasterCsv();
});

function downloadMasterCsv() {
    if (!masterBlobUrl) {
        showToast('No processed data available to download.', 'error');
        return;
    }
    const weekRange = weekDateRangeInput.value.trim() || 'weekly';
    const sanitizedRange = weekRange.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);

    const link = document.createElement('a');
    link.href = masterBlobUrl;
    link.download = `All_Schools_Clean_Emails_${sanitizedRange}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addConsoleLog(`Downloaded master combined CSV for week "${weekRange}".`, 'success');
    showToast(`Downloaded master combined CSV!`, 'success');
}

// ==========================================
// Weekly School Records Summary Ledger & Tabs
// ==========================================
function saveBatchSchoolsToWeek(weekRange, detectedSchools) {
    if (!weekRange || !detectedSchools || detectedSchools.length === 0) return;

    let targetWeek = weeklyRecords.find(w => w.weekRange.toLowerCase() === weekRange.toLowerCase());

    if (!targetWeek) {
        targetWeek = {
            weekRange: weekRange,
            createdAt: new Date().toISOString(),
            schools: []
        };
        // Add to front of weeks list
        weeklyRecords.unshift(targetWeek);
    }

    // Merge or add detected schools
    detectedSchools.forEach(sch => {
        const existingIdx = targetWeek.schools.findIndex(s => 
            s.extension.toLowerCase() === sch.extension.toLowerCase() ||
            s.schoolName.toLowerCase() === sch.schoolName.toLowerCase()
        );

        const schoolRecord = {
            id: 'sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            schoolName: sch.schoolName,
            extension: sch.extension,
            uniqueCount: sch.uniqueCount,
            csvContent: sch.csvContent,
            sampleEmails: sch.sampleEmails || []
        };

        if (existingIdx !== -1) {
            // Update existing record
            targetWeek.schools[existingIdx] = schoolRecord;
        } else {
            // Append new record
            targetWeek.schools.push(schoolRecord);
        }
    });

    // Sort schools alphabetically
    targetWeek.schools.sort((a, b) => a.schoolName.localeCompare(b.schoolName));

    activeWeekRange = targetWeek.weekRange;
    saveWeeklyRecords(weeklyRecords);
    renderWeeklyTabs();
    renderWeeklyLedger();
}

function renderWeeklyTabs() {
    weekTabsBar.innerHTML = '';
    
    if (weeklyRecords.length === 0) {
        weekTabsBar.innerHTML = `<span style="font-size: 0.8rem; color: var(--text-muted); padding: 0.4rem 0.5rem;">No weekly tabs created yet. Upload a batch or click "+ New Week Tab".</span>`;
        return;
    }

    weeklyRecords.forEach(week => {
        const isActive = activeWeekRange && week.weekRange.toLowerCase() === activeWeekRange.toLowerCase();
        const tabBtn = document.createElement('button');
        tabBtn.type = 'button';
        tabBtn.className = `week-tab-btn ${isActive ? 'active' : ''}`;
        
        tabBtn.innerHTML = `
            <span>${escapeHtml(week.weekRange)}</span>
            <span class="week-tab-badge">${week.schools.length}</span>
            <button type="button" class="week-tab-close" title="Remove this week tab" onclick="window.removeWeekTab('${escapeHtml(week.weekRange)}', event)">✕</button>
        `;

        tabBtn.addEventListener('click', (e) => {
            if (e.target.classList.contains('week-tab-close')) return;
            activeWeekRange = week.weekRange;
            weekDateRangeInput.value = week.weekRange;
            clearWeekRangeBtn.style.display = 'block';
            renderWeeklyTabs();
            renderWeeklyLedger();
        });

        weekTabsBar.appendChild(tabBtn);
    });
}

window.removeWeekTab = function(weekRangeName, event) {
    if (event) event.stopPropagation();
    
    const week = weeklyRecords.find(w => w.weekRange === weekRangeName);
    if (!week) return;

    if (confirm(`Are you sure you want to delete the week tab "${weekRangeName}" and its ${week.schools.length} school record(s)?`)) {
        weeklyRecords = weeklyRecords.filter(w => w.weekRange !== weekRangeName);
        if (activeWeekRange === weekRangeName) {
            activeWeekRange = weeklyRecords.length > 0 ? weeklyRecords[0].weekRange : null;
        }
        saveWeeklyRecords(weeklyRecords);
        renderWeeklyTabs();
        renderWeeklyLedger();
        showToast(`Deleted week tab "${weekRangeName}".`, 'info');
    }
};

function renderWeeklyLedger() {
    ledgerTableBody.innerHTML = '';

    if (weeklyRecords.length === 0) {
        ledgerTable.style.display = 'none';
        ledgerPlaceholder.style.display = 'block';
        ledgerActiveWeekDisplay.textContent = 'No Week Selected';
        ledgerSchoolsCount.textContent = '0';
        ledgerTotalCount.textContent = '0';
        return;
    }

    // Find active week or select the first available
    let activeWeek = weeklyRecords.find(w => activeWeekRange && w.weekRange.toLowerCase() === activeWeekRange.toLowerCase());
    if (!activeWeek) {
        activeWeek = weeklyRecords[0];
        activeWeekRange = activeWeek.weekRange;
        renderWeeklyTabs();
    }

    ledgerActiveWeekDisplay.textContent = activeWeek.weekRange;
    ledgerSchoolsCount.textContent = activeWeek.schools.length.toLocaleString();

    let grandTotalUnique = 0;
    activeWeek.schools.forEach(s => {
        grandTotalUnique += (Number(s.uniqueCount) || 0);
    });
    ledgerTotalCount.textContent = grandTotalUnique.toLocaleString();

    if (activeWeek.schools.length === 0) {
        ledgerTable.style.display = 'none';
        ledgerPlaceholder.style.display = 'block';
        ledgerPlaceholderText.textContent = `No schools in "${activeWeek.weekRange}" yet.`;
        return;
    }

    ledgerPlaceholder.style.display = 'none';
    ledgerTable.style.display = 'table';

    activeWeek.schools.forEach((sch, index) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', sch.id);

        tr.innerHTML = `
            <td><span class="row-index">${index + 1}</span></td>
            <td>
                <div class="school-name-cell" id="schoolNameCell_${sch.id}">
                    <span class="school-name-text" onclick="window.startInlineEditSchool('${sch.id}')" title="Click to edit school name">${escapeHtml(sch.schoolName)}</span>
                    <button class="btn-inline-edit" onclick="window.startInlineEditSchool('${sch.id}')" title="Edit name">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                </div>
            </td>
            <td>
                <span class="extension-badge">${escapeHtml(sch.extension)}</span>
            </td>
            <td style="text-align: right;">
                <span class="unique-count-badge">${Number(sch.uniqueCount).toLocaleString()}</span>
            </td>
            <td>
                <div class="row-actions-group">
                    ${sch.csvContent ? `
                        <button class="btn-table-action download" onclick="window.downloadSchoolCSV('${sch.id}')" title="Download clean emails for this school">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                    ` : ''}
                    <button class="btn-table-action delete" onclick="window.deleteSchoolRecord('${sch.id}')" title="Delete record from ledger">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </td>
        `;

        ledgerTableBody.appendChild(tr);
    });

    // Summary Total Row for Active Week
    const totalRow = document.createElement('tr');
    totalRow.className = 'ledger-summary-row';
    totalRow.style.background = 'rgba(255, 255, 255, 0.04)';
    totalRow.style.fontWeight = '700';
    totalRow.innerHTML = `
        <td style="text-align: center; color: var(--color-primary-light);">∑</td>
        <td style="color: #ffffff;">Total (${activeWeek.schools.length} Schools)</td>
        <td><span style="font-size: 0.75rem; color: var(--text-muted);">All Extensions</span></td>
        <td style="text-align: right; color: var(--color-success); font-size: 1rem;">
            ${grandTotalUnique.toLocaleString()}
        </td>
        <td style="text-align: center; color: var(--text-muted); font-size: 0.8rem;">—</td>
    `;
    ledgerTableBody.appendChild(totalRow);
}

// Inline Editing for School Name in Ledger
window.startInlineEditSchool = function(id) {
    let targetSchool = null;
    let targetWeek = null;

    for (const week of weeklyRecords) {
        const found = week.schools.find(s => s.id === id);
        if (found) {
            targetSchool = found;
            targetWeek = week;
            break;
        }
    }

    if (!targetSchool) return;

    const cell = document.getElementById(`schoolNameCell_${id}`);
    if (!cell) return;

    cell.innerHTML = `
        <div class="inline-edit-box">
            <input type="text" class="inline-edit-input" id="inlineInput_${id}" value="${escapeHtml(targetSchool.schoolName)}" />
            <button class="btn-inline-save" onclick="window.saveInlineEditSchool('${id}')" title="Save">✓</button>
            <button class="btn-inline-cancel" onclick="renderWeeklyLedger()" title="Cancel">✕</button>
        </div>
    `;

    const input = document.getElementById(`inlineInput_${id}`);
    if (input) {
        input.focus();
        input.select();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') window.saveInlineEditSchool(id);
            if (e.key === 'Escape') renderWeeklyLedger();
        });
    }
};

window.saveInlineEditSchool = function(id) {
    const input = document.getElementById(`inlineInput_${id}`);
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) {
        showToast('School name cannot be empty.', 'error');
        return;
    }

    for (const week of weeklyRecords) {
        const found = week.schools.find(s => s.id === id);
        if (found) {
            found.schoolName = newName;
            saveWeeklyRecords(weeklyRecords);
            renderWeeklyLedger();
            showToast(`Updated school name to "${newName}".`, 'success');
            return;
        }
    }
};

window.deleteSchoolRecord = function(id) {
    for (const week of weeklyRecords) {
        const found = week.schools.find(s => s.id === id);
        if (found) {
            if (confirm(`Are you sure you want to delete "${found.schoolName}" (${found.extension}) from this week?`)) {
                week.schools = week.schools.filter(s => s.id !== id);
                saveWeeklyRecords(weeklyRecords);
                renderWeeklyTabs();
                renderWeeklyLedger();
                addConsoleLog(`Removed "${found.schoolName}" from week "${week.weekRange}".`, 'info');
                showToast(`Removed "${found.schoolName}"!`, 'info');
            }
            return;
        }
    }
};

window.downloadSchoolCSV = function(id) {
    for (const week of weeklyRecords) {
        const found = week.schools.find(s => s.id === id);
        if (found) {
            if (!found.csvContent) {
                showToast('CSV content not available for this entry.', 'error');
                return;
            }
            const blob = new Blob([found.csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const sanitizedName = found.schoolName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
            const link = document.createElement('a');
            link.href = url;
            link.download = `${sanitizedName}_clean_emails.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            showToast(`Downloaded clean emails for "${found.schoolName}".`, 'success');
            return;
        }
    }
};

// ==========================================
// Next Week Batch Workflow
// ==========================================
nextBatchBtn.addEventListener('click', () => {
    uploadedFiles = [];
    renderFileList();
    updateUploadStats();

    currentBatchSchools = [];
    currentBatchCard.style.display = 'none';
    currentSchoolsGrid.innerHTML = '';

    previewTableBody.innerHTML = '';
    previewTable.style.display = 'none';
    previewPlaceholder.style.display = 'block';

    progressBanner.style.display = 'none';
    progressBarFill.style.width = '0%';
    progressPercentText.textContent = '0%';

    if (masterBlobUrl) {
        URL.revokeObjectURL(masterBlobUrl);
        masterBlobUrl = null;
    }
    downloadBtn.disabled = true;
    nextBatchBtn.disabled = true;

    // Advance week date range input if currently matches this week
    weekDateRangeInput.value = '';
    clearWeekRangeBtn.style.display = 'none';
    weekDateRangeInput.placeholder = 'Enter date range for next week (e.g. 6th Nov - 11th Nov)';
    weekDateRangeInput.focus();

    addConsoleLog('Upload zone cleared for next week batch. All school records preserved safely in weekly ledger.', 'info');
    showToast('Ready for next week\'s dump! Ledger records preserved safely.', 'success');
});

resetBtn.addEventListener('click', () => {
    if (confirm('Clear uploaded files and reset analysis dashboard? (Weekly records ledger will remain safe).')) {
        uploadedFiles = [];
        renderFileList();
        updateUploadStats();

        currentBatchSchools = [];
        currentBatchCard.style.display = 'none';
        currentSchoolsGrid.innerHTML = '';

        previewTableBody.innerHTML = '';
        previewTable.style.display = 'none';
        previewPlaceholder.style.display = 'block';

        progressBanner.style.display = 'none';
        
        statFiles.textContent = '0';
        statProcessed.textContent = '0';
        statFiltered.textContent = '0';
        statClean.textContent = '0';
        statSchools.textContent = '0';

        if (masterBlobUrl) {
            URL.revokeObjectURL(masterBlobUrl);
            masterBlobUrl = null;
        }
        downloadBtn.disabled = true;
        nextBatchBtn.disabled = true;
        showToast('Dashboard reset.', 'info');
    }
});

// ==========================================
// Multi-Tab Excel Export (SheetJS / XLSX)
// Column A: School Name | Column B: Extention | Column C: Unique Count
// Each week is exported as its own separate sheet tab!
// ==========================================
downloadRecordExcelBtn.addEventListener('click', () => {
    if (weeklyRecords.length === 0) {
        showToast('No weekly school records in ledger to export.', 'error');
        return;
    }

    let totalSchoolsAcrossAllWeeks = 0;
    weeklyRecords.forEach(w => {
        totalSchoolsAcrossAllWeeks += (w.schools ? w.schools.length : 0);
    });

    if (totalSchoolsAcrossAllWeeks === 0) {
        showToast('All weekly tabs are empty. Upload files or add school records first.', 'error');
        return;
    }

    if (typeof XLSX !== 'undefined') {
        exportMultiSheetExcel();
    } else {
        // Fallback to CSV if SheetJS is somehow unavailable
        exportFallbackMultiWeekCsv();
    }
});

function exportMultiSheetExcel() {
    const wb = XLSX.utils.book_new();
    let sheetsAdded = 0;

    for (const week of weeklyRecords) {
        if (!week.schools || week.schools.length === 0) continue;

        // Clean sheet name: Excel allows max 31 characters and forbids: \ / ? * [ ] :
        let rawSheetName = (week.weekRange || 'Week')
            .replace(/[:\\/?*\[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        if (rawSheetName.length > 31) {
            rawSheetName = rawSheetName.substring(0, 31).trim();
        }
        if (!rawSheetName) {
            rawSheetName = `Week_${sheetsAdded + 1}`;
        }

        // Exact requested columns:
        // Column A: School Name
        // Column B: Extention
        // Column C: Unique Count
        const sheetData = [
            ['School Name', 'Extention', 'Unique Count']
        ];

        let weekSum = 0;
        for (const sch of week.schools) {
            const count = Number(sch.uniqueCount) || 0;
            sheetData.push([
                sch.schoolName || '',
                sch.extension || '',
                count
            ]);
            weekSum += count;
        }

        // Summary Total Row
        sheetData.push([
            `Total (${week.schools.length} Schools)`,
            '',
            weekSum
        ]);

        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        // Set column widths for beautiful layout
        ws['!cols'] = [
            { wch: 28 }, // Column A: School Name
            { wch: 32 }, // Column B: Extention
            { wch: 18 }  // Column C: Unique Count
        ];

        XLSX.utils.book_append_sheet(wb, ws, rawSheetName);
        sheetsAdded++;
    }

    if (sheetsAdded === 0) {
        showToast('No school data to export in any weekly tab.', 'error');
        return;
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Weekly_School_Records_${dateStr}.xlsx`;
    XLSX.writeFile(wb, filename);

    addConsoleLog(`Exported Excel workbook "${filename}" with ${sheetsAdded} weekly sheet tabs.`, 'success');
    showToast(`Downloaded Excel record with ${sheetsAdded} weekly tabs!`, 'success');
}

function exportFallbackMultiWeekCsv() {
    let csv = '\uFEFF'; // UTF-8 BOM
    let totalSchools = 0;
    let grandTotalSum = 0;

    for (const week of weeklyRecords) {
        csv += `\n--- WEEK: ${week.weekRange} ---\n`;
        csv += 'School Name,Extention,Unique Count\n';

        let weekSum = 0;
        for (const sch of week.schools) {
            const escapedName = (sch.schoolName.includes(',') || sch.schoolName.includes('"'))
                ? `"${sch.schoolName.replace(/"/g, '""')}"` : sch.schoolName;
            const count = Number(sch.uniqueCount) || 0;
            csv += `${escapedName},${sch.extension || ''},${count}\n`;
            weekSum += count;
            totalSchools++;
        }
        csv += `Total (${week.schools.length} Schools),,${weekSum}\n`;
        grandTotalSum += weekSum;
    }

    csv += `\nGRAND TOTAL (${totalSchools} Schools Across All Weeks),,${grandTotalSum}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Weekly_School_Records_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Downloaded records summary CSV!`, 'success');
}

// Clear active week records
clearWeekRecordsBtn.addEventListener('click', () => {
    if (!activeWeekRange) return;
    const week = weeklyRecords.find(w => w.weekRange.toLowerCase() === activeWeekRange.toLowerCase());
    if (!week || week.schools.length === 0) return;

    if (confirm(`Clear all ${week.schools.length} school records for week "${week.weekRange}"?`)) {
        week.schools = [];
        saveWeeklyRecords(weeklyRecords);
        renderWeeklyTabs();
        renderWeeklyLedger();
        showToast(`Cleared records for "${week.weekRange}".`, 'info');
    }
});

// Clear all weeks
clearAllRecordsBtn.addEventListener('click', () => {
    if (weeklyRecords.length === 0) return;
    if (confirm(`Are you sure you want to clear ALL ${weeklyRecords.length} weekly tabs and all records? This cannot be undone.`)) {
        weeklyRecords = [];
        activeWeekRange = null;
        saveWeeklyRecords(weeklyRecords);
        renderWeeklyTabs();
        renderWeeklyLedger();
        addConsoleLog('All weekly records cleared.', 'info');
        showToast('All weekly records cleared.', 'info');
    }
});

// ==========================================
// Add Manual Record Modal
// ==========================================
addManualRecordBtn.addEventListener('click', () => {
    manualWeekRangeInput.value = activeWeekRange || weekDateRangeInput.value.trim() || getWeekDateRangeString(0);
    manualSchoolNameInput.value = '';
    manualExtensionInput.value = '';
    manualUniqueCountInput.value = '';
    manualRecordModal.style.display = 'flex';
    manualSchoolNameInput.focus();
});

function closeManualModal() {
    manualRecordModal.style.display = 'none';
}

closeManualModalBtn.addEventListener('click', closeManualModal);
cancelManualRecordBtn.addEventListener('click', closeManualModal);

manualRecordModal.addEventListener('click', (e) => {
    if (e.target === manualRecordModal) closeManualModal();
});

saveManualRecordBtn.addEventListener('click', () => {
    const weekRange = manualWeekRangeInput.value.trim() || 'Current Week';
    const schoolName = manualSchoolNameInput.value.trim();
    let extension = manualExtensionInput.value.trim();
    const count = parseInt(manualUniqueCountInput.value, 10);

    if (!schoolName) {
        showToast('Please enter a school name.', 'error');
        manualSchoolNameInput.focus();
        return;
    }

    if (isNaN(count) || count < 0) {
        showToast('Please enter a valid unique count (0 or greater).', 'error');
        manualUniqueCountInput.focus();
        return;
    }

    if (extension && !extension.startsWith('@')) {
        extension = '@' + extension;
    }

    let week = weeklyRecords.find(w => w.weekRange.toLowerCase() === weekRange.toLowerCase());
    if (!week) {
        week = {
            weekRange: weekRange,
            createdAt: new Date().toISOString(),
            schools: []
        };
        weeklyRecords.unshift(week);
    }

    const newRecord = {
        id: 'sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        schoolName: schoolName,
        extension: extension || '@manual.entry',
        uniqueCount: count,
        csvContent: null,
        sampleEmails: []
    };

    week.schools.push(newRecord);
    week.schools.sort((a, b) => a.schoolName.localeCompare(b.schoolName));

    activeWeekRange = week.weekRange;
    saveWeeklyRecords(weeklyRecords);
    renderWeeklyTabs();
    renderWeeklyLedger();

    closeManualModal();
    addConsoleLog(`Manually added "${schoolName}" (${count.toLocaleString()} unique emails) to week "${week.weekRange}".`, 'info');
    showToast(`Added "${schoolName}" to week "${week.weekRange}"!`, 'success');
});

// ==========================================
// New Week Tab Modal
// ==========================================
addNewWeekBtn.addEventListener('click', () => {
    newWeekRangeInput.value = '';
    newWeekRangeInput.placeholder = 'e.g. 6th Nov - 11th Nov';
    newWeekModal.style.display = 'flex';
    newWeekRangeInput.focus();
});

function closeNewWeekModal() {
    newWeekModal.style.display = 'none';
}

closeNewWeekModalBtn.addEventListener('click', closeNewWeekModal);
cancelNewWeekBtn.addEventListener('click', closeNewWeekModal);

newWeekModal.addEventListener('click', (e) => {
    if (e.target === newWeekModal) closeNewWeekModal();
});

confirmNewWeekBtn.addEventListener('click', () => {
    const range = newWeekRangeInput.value.trim();
    if (!range) {
        showToast('Please enter a week date range.', 'error');
        newWeekRangeInput.focus();
        return;
    }

    let existing = weeklyRecords.find(w => w.weekRange.toLowerCase() === range.toLowerCase());
    if (existing) {
        activeWeekRange = existing.weekRange;
        renderWeeklyTabs();
        renderWeeklyLedger();
        closeNewWeekModal();
        showToast(`Switched to existing week "${existing.weekRange}".`, 'info');
        return;
    }

    const newWeek = {
        weekRange: range,
        createdAt: new Date().toISOString(),
        schools: []
    };

    weeklyRecords.unshift(newWeek);
    activeWeekRange = range;
    weekDateRangeInput.value = range;
    clearWeekRangeBtn.style.display = 'block';

    saveWeeklyRecords(weeklyRecords);
    renderWeeklyTabs();
    renderWeeklyLedger();

    closeNewWeekModal();
    showToast(`Created new weekly tab: "${range}"!`, 'success');
});

// ==========================================
// Dropdown UI Events
// ==========================================
dropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdownTrigger.classList.contains('disabled')) return;
    const isVisible = dropdownMenu.style.display === 'flex';
    dropdownMenu.style.display = isVisible ? 'none' : 'flex';
    dropdownTrigger.classList.toggle('active', !isVisible);
});

document.addEventListener('click', (e) => {
    if (!dropdownTrigger.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.style.display = 'none';
        dropdownTrigger.classList.remove('active');
    }
});

selectAllCheckbox.addEventListener('change', () => {
    const isChecked = selectAllCheckbox.checked;
    const actionCheckboxes = getActionCheckboxes();
    actionCheckboxes.forEach(cb => {
        cb.checked = isChecked;
    });
    updateSelectedActionsText();
    
    const hasChecked = actionCheckboxes.some(cb => cb.checked);
    processBtn.disabled = !hasChecked || uploadedFiles.length === 0;
});

// ==========================================
// Utility Helpers
// ==========================================
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function addConsoleLog(message, type = 'info', timestamp = null) {
    const time = timestamp || new Date().toLocaleTimeString();
    const logEl = document.createElement('div');
    logEl.className = `console-log ${type}`;
    logEl.innerHTML = `<span class="timestamp">[${time}]</span>${message}`;
    consolePanel.appendChild(logEl);
    consolePanel.scrollTop = consolePanel.scrollHeight;
}

function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
        iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
        iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
    } else {
        iconSvg = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    
    toast.innerHTML = `
        <span class="toast-icon">${iconSvg}</span>
        <span class="toast-message">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
