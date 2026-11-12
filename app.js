// Application Coordinator for CSV Dataflow Admin Console Processor
// v2.2.0 - School Record Ledger (Column A: School Name, Column B: Unique Count) + Excel Export

// ==========================================
// Application State
// ==========================================
let uploadedFiles = [];
let worker = null;
let processedBlobUrl = null;
let detectedActions = []; // Dynamically detected action values from CSV
let isSchoolNameAutoDetected = false;

const RECORDS_STORAGE_KEY = 'dataflow_school_records_v1';
let schoolRecords = loadSchoolRecords();

// ==========================================
// UI Elements
// ==========================================
// Sidebar Upload & Mapping
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const schoolNameInput = document.getElementById('schoolNameInput');
const schoolNameAutoBadge = document.getElementById('schoolNameAutoBadge');
const clearSchoolNameBtn = document.getElementById('clearSchoolNameBtn');

const dropdownTrigger = document.getElementById('dropdownTrigger');
const dropdownMenu = document.getElementById('dropdownMenu');
const selectedActionsText = document.getElementById('selectedActionsText');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const actionItemsContainer = document.getElementById('actionItemsContainer');
const processBtn = document.getElementById('processBtn');
const resetBtn = document.getElementById('resetBtn');
const nextSchoolBtn = document.getElementById('nextSchoolBtn');
const downloadBtn = document.getElementById('downloadBtn');

// Dashboard Stats
const statFiles = document.getElementById('statFiles');
const statProcessed = document.getElementById('statProcessed');
const statFiltered = document.getElementById('statFiltered');
const statClean = document.getElementById('statClean');

// Progress & Console
const progressBanner = document.getElementById('progressBanner');
const progressStatusText = document.getElementById('progressStatusText');
const progressPercentText = document.getElementById('progressPercentText');
const progressBarFill = document.getElementById('progressBarFill');
const consolePanel = document.getElementById('consolePanel');

// Preview Table
const previewTable = document.getElementById('previewTable');
const previewTableBody = document.getElementById('previewTableBody');
const previewPlaceholder = document.getElementById('previewPlaceholder');

// School Records Ledger
const ledgerCard = document.getElementById('ledgerCard');
const ledgerTable = document.getElementById('ledgerTable');
const ledgerTableBody = document.getElementById('ledgerTableBody');
const ledgerPlaceholder = document.getElementById('ledgerPlaceholder');
const ledgerSchoolsCount = document.getElementById('ledgerSchoolsCount');
const ledgerTotalCount = document.getElementById('ledgerTotalCount');
const addManualRecordBtn = document.getElementById('addManualRecordBtn');
const downloadRecordExcelBtn = document.getElementById('downloadRecordExcelBtn');
const clearAllRecordsBtn = document.getElementById('clearAllRecordsBtn');

// Manual Add Modal
const manualRecordModal = document.getElementById('manualRecordModal');
const closeManualModalBtn = document.getElementById('closeManualModalBtn');
const cancelManualRecordBtn = document.getElementById('cancelManualRecordBtn');
const saveManualRecordBtn = document.getElementById('saveManualRecordBtn');
const manualSchoolNameInput = document.getElementById('manualSchoolNameInput');
const manualUniqueCountInput = document.getElementById('manualUniqueCountInput');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    renderSchoolRecordsLedger();
});

// Helper: Custom CSV parsing for header reading in main thread
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

// Format bytes to readable size
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Add logs to the console panel
function addConsoleLog(message, type = 'info', timestamp = null) {
    const time = timestamp || new Date().toLocaleTimeString();
    const logEl = document.createElement('div');
    logEl.className = `console-log ${type}`;
    logEl.innerHTML = `<span class="timestamp">[${time}]</span>${message}`;
    consolePanel.appendChild(logEl);
    consolePanel.scrollTop = consolePanel.scrollHeight;
}

// Toast Notification Helper
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

// ==========================================
// Smart School Name Detection
// ==========================================
function detectSchoolNameFromFilename(filename) {
    if (!filename) return '';
    // Strip file extension
    let name = filename.replace(/\.[^/.]+$/, '');
    
    // Strip common suffixes/prefixes like "_content_log", "_console_log", "log", "raw", "export"
    name = name.replace(/[-_]?(content[-_]?logs?|console[-_]?logs?|logs?|raw|clean|filtered|data|export|report|adobe[-_]?console|adobe)[-_]?/gi, ' ');
    
    // Strip dates like 2026-11-12 or 20261112 or standalone year 2026
    name = name.replace(/[-_]?\d{4}[-_]\d{2}[-_]\d{2}/g, '');
    name = name.replace(/[-_]?\b(202[0-9])\b/g, '');
    
    // Replace underscores and multiple dashes with spaces
    name = name.replace(/[_-]+/g, ' ');
    name = name.replace(/\s+/g, ' ').trim();
    
    // If the name is completely lowercase, capitalize words
    if (name.length > 0 && name === name.toLowerCase()) {
        name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    
    return name || filename.replace(/\.[^/.]+$/, '').trim();
}

schoolNameInput.addEventListener('input', () => {
    isSchoolNameAutoDetected = false;
    schoolNameAutoBadge.style.display = 'none';
    clearSchoolNameBtn.style.display = schoolNameInput.value.trim() ? 'block' : 'none';
});

clearSchoolNameBtn.addEventListener('click', () => {
    schoolNameInput.value = '';
    isSchoolNameAutoDetected = false;
    schoolNameAutoBadge.style.display = 'none';
    clearSchoolNameBtn.style.display = 'none';
    schoolNameInput.focus();
});

// ==========================================
// Dynamic Action Detection from CSV Files
// ==========================================
function detectActionColumnIndex(headers) {
    const keywords = ['action', 'event', 'activity', 'operation', 'type', 'permission'];
    for (const kw of keywords) {
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toLowerCase().trim();
            if (header === kw || header.includes(kw)) {
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

function populateActionDropdown(actions, selectAll = true) {
    actionItemsContainer.innerHTML = '';
    detectedActions = actions;
    
    actions.forEach(action => {
        const label = document.createElement('label');
        label.className = 'dropdown-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = action;
        checkbox.checked = selectAll;
        
        const span = document.createElement('span');
        span.textContent = action;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        actionItemsContainer.appendChild(label);
        
        checkbox.addEventListener('change', () => {
            const allCheckboxes = getActionCheckboxes();
            const allChecked = allCheckboxes.every(c => c.checked);
            selectAllCheckbox.checked = allChecked;
            updateSelectedActionsText();
            
            const hasChecked = allCheckboxes.some(cb => cb.checked);
            processBtn.disabled = !hasChecked || uploadedFiles.length === 0;
        });
    });
    
    selectAllCheckbox.checked = selectAll;
    updateSelectedActionsText();
}

function getActionCheckboxes() {
    return Array.from(actionItemsContainer.querySelectorAll('input[type="checkbox"]'));
}

function updateSelectedActionsText() {
    const checkboxes = getActionCheckboxes();
    const selected = checkboxes
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    if (checkboxes.length === 0) {
        selectedActionsText.textContent = "Upload CSV files to detect actions...";
    } else if (selected.length === 0) {
        selectedActionsText.textContent = "Select actions...";
    } else if (selected.length === checkboxes.length) {
        selectedActionsText.textContent = `All actions selected (${selected.length})`;
    } else {
        selectedActionsText.textContent = selected.join(', ');
    }
}

// ==========================================
// File Upload & Handling
// ==========================================
uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFileSelection(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        handleFileSelection(fileInput.files);
    }
});

async function handleFileSelection(fileListObj) {
    const newFiles = Array.from(fileListObj).filter(file => file.name.endsWith('.csv'));
    
    if (newFiles.length === 0) {
        addConsoleLog('Selected files are not valid CSV format.', 'error');
        showToast('Please select valid CSV files.', 'error');
        return;
    }

    uploadedFiles = [...uploadedFiles, ...newFiles];
    addConsoleLog(`Added ${newFiles.length} CSV file(s). Total files: ${uploadedFiles.length}.`, 'info');
    
    // Auto-detect School Name if not manually filled
    if (!schoolNameInput.value.trim() || isSchoolNameAutoDetected) {
        const detectedName = detectSchoolNameFromFilename(uploadedFiles[0].name);
        if (detectedName) {
            schoolNameInput.value = detectedName;
            isSchoolNameAutoDetected = true;
            schoolNameAutoBadge.style.display = 'inline-block';
            clearSchoolNameBtn.style.display = 'block';
            addConsoleLog(`Auto-detected school name: "${detectedName}"`, 'info');
        }
    }
    
    renderFileList();
    updateStatsBoard();
    
    addConsoleLog('Scanning CSV files to detect action filter values...', 'info');
    try {
        const actions = await scanForActionValues(uploadedFiles);
        if (actions.length > 0) {
            populateActionDropdown(actions, true);
            addConsoleLog(`Detected ${actions.length} unique action types: ${actions.join(', ')}`, 'success');
            processBtn.disabled = false;
        } else {
            addConsoleLog('No action values detected in CSV files. Check column headers.', 'error');
            processBtn.disabled = true;
        }
    } catch (err) {
        addConsoleLog(`Error scanning CSV files: ${err.message}`, 'error');
    }
}

function renderFileList() {
    fileList.innerHTML = '';
    uploadedFiles.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        
        item.innerHTML = `
            <div class="file-info">
                <span class="file-name" title="${file.name}">${file.name}</span>
                <span class="file-size">${formatBytes(file.size)}</span>
            </div>
            <button class="file-remove" data-index="${index}" title="Remove file">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;
        
        item.querySelector('.file-remove').addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-index'));
            removeFile(idx);
        });
        
        fileList.appendChild(item);
    });

    processBtn.disabled = uploadedFiles.length === 0;
}

function removeFile(index) {
    addConsoleLog(`Removed file "${uploadedFiles[index].name}".`, 'info');
    uploadedFiles.splice(index, 1);
    renderFileList();
    updateStatsBoard();
    
    if (uploadedFiles.length === 0) {
        actionItemsContainer.innerHTML = '';
        detectedActions = [];
        selectAllCheckbox.checked = false;
        updateSelectedActionsText();
        processBtn.disabled = true;
        
        if (isSchoolNameAutoDetected) {
            schoolNameInput.value = '';
            schoolNameAutoBadge.style.display = 'none';
            clearSchoolNameBtn.style.display = 'none';
            isSchoolNameAutoDetected = false;
        }
    }
}

function updateStatsBoard(stats = null) {
    statFiles.textContent = uploadedFiles.length;
    if (stats) {
        statProcessed.textContent = stats.totalRawRecords.toLocaleString();
        statFiltered.textContent = stats.totalMatchingActions.toLocaleString();
        statClean.textContent = stats.finalCleanCount.toLocaleString();
    } else {
        statProcessed.textContent = '0';
        statFiltered.textContent = '0';
        statClean.textContent = '0';
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

    let currentSchoolName = schoolNameInput.value.trim();
    if (!currentSchoolName) {
        currentSchoolName = detectSchoolNameFromFilename(uploadedFiles[0].name) || 'Unnamed School';
        schoolNameInput.value = currentSchoolName;
    }

    toggleInputs(true);
    
    progressBanner.style.display = 'block';
    progressStatusText.textContent = `Starting pipeline for "${currentSchoolName}"...`;
    progressPercentText.textContent = '0%';
    progressBarFill.style.width = '0%';
    
    previewTable.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    downloadBtn.disabled = true;
    nextSchoolBtn.disabled = true;

    if (processedBlobUrl) {
        URL.revokeObjectURL(processedBlobUrl);
        processedBlobUrl = null;
    }

    addConsoleLog(`Processing "${currentSchoolName}" (${uploadedFiles.length} file(s))...`, 'info');
    addConsoleLog(`Active action filters: ${actionValues}`, 'info');

    worker = new Worker('parser-worker.js?v=2.0.0');

    worker.postMessage({
        files: uploadedFiles,
        emailColConfig: 'auto',
        actionColConfig: 'auto',
        actionValuesRaw: actionValues
    });

    worker.onmessage = function(e) {
        const { type, percent, fileName, rawRecords, matchingActions, cleanEmails, message, logLevel, data } = e.data;

        switch (type) {
            case 'PROGRESS':
                progressBarFill.style.width = `${percent}%`;
                progressPercentText.textContent = `${percent}%`;
                progressStatusText.textContent = `Parsing "${fileName}" [${percent}%]`;
                
                statProcessed.textContent = rawRecords.toLocaleString();
                statFiltered.textContent = matchingActions.toLocaleString();
                statClean.textContent = cleanEmails.toLocaleString();
                break;

            case 'LOG':
                addConsoleLog(e.data.message, e.data.logLevel, e.data.timestamp);
                break;

            case 'COMPLETE':
                addConsoleLog(`Finished processing "${currentSchoolName}". Found ${e.data.data.stats.finalCleanCount.toLocaleString()} unique emails.`, 'success');
                finishProcessing(e.data.data, currentSchoolName);
                break;

            case 'ERROR':
                addConsoleLog(`Processing Error: ${e.data.message}`, 'error');
                showToast(`Processing error: ${e.data.message}`, 'error');
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
    schoolNameInput.disabled = disabled;
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

function finishProcessing(result, schoolName) {
    progressBanner.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    progressBanner.style.background = 'rgba(16, 185, 129, 0.05)';
    progressStatusText.innerHTML = `<span style="color: var(--color-success); font-weight: 600;">Processing Finished for ${escapeHtml(schoolName)}</span>`;
    progressBarFill.style.width = '100%';
    progressPercentText.textContent = '100%';
    
    updateStatsBoard(result.stats);
    renderPreviewTable(result.previewRows);

    const blob = new Blob([result.csvContent], { type: 'text/csv;charset=utf-8;' });
    processedBlobUrl = URL.createObjectURL(blob);
    downloadBtn.disabled = false;
    nextSchoolBtn.disabled = false;

    toggleInputs(false);
    const hasChecked = getActionCheckboxes().some(cb => cb.checked);
    processBtn.disabled = !hasChecked || uploadedFiles.length === 0;

    if (worker) {
        worker.terminate();
        worker = null;
    }

    // Save to School Records Ledger
    const now = new Date();
    const formattedDate = now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newRecord = {
        id: 'sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        schoolName: schoolName,
        uniqueCount: result.stats.finalCleanCount,
        timestamp: formattedDate,
        isoDate: now.toISOString(),
        filesCount: uploadedFiles.length,
        fileNames: uploadedFiles.map(f => f.name),
        rawRecords: result.stats.totalRawRecords,
        csvContent: result.csvContent // saved for instant re-download
    };

    schoolRecords.push(newRecord);
    saveSchoolRecords(schoolRecords);
    renderSchoolRecordsLedger();

    showToast(`Recorded "${schoolName}" with ${result.stats.finalCleanCount.toLocaleString()} unique emails!`, 'success');
}

function renderPreviewTable(rows) {
    previewTableBody.innerHTML = '';
    if (rows.length === 0) {
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
        `;
        previewTableBody.appendChild(tr);
    });

    previewPlaceholder.style.display = 'none';
    previewTable.style.display = 'table';
}

// Download Button Event (Current School Clean Email CSV)
downloadBtn.addEventListener('click', () => {
    if (!processedBlobUrl) return;
    
    const schoolName = schoolNameInput.value.trim() || 'school';
    const sanitizedName = schoolName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10);
    
    const link = document.createElement('a');
    link.href = processedBlobUrl;
    link.setAttribute('download', `${sanitizedName}_clean_emails_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addConsoleLog(`Downloaded clean emails for "${schoolName}".`, 'success');
    showToast(`Downloaded clean emails for "${schoolName}"!`, 'success');
});

// ==========================================
// Next School Batch Workflow
// ==========================================
nextSchoolBtn.addEventListener('click', () => {
    uploadedFiles = [];
    renderFileList();
    updateStatsBoard();

    if (worker) {
        worker.terminate();
        worker = null;
    }

    if (processedBlobUrl) {
        URL.revokeObjectURL(processedBlobUrl);
        processedBlobUrl = null;
    }

    progressBanner.style.display = 'none';
    progressBanner.style.border = '1px solid rgba(99, 102, 241, 0.15)';
    progressBanner.style.background = 'rgba(99, 102, 241, 0.06)';
    progressBarFill.style.width = '0%';
    progressPercentText.textContent = '0%';

    previewTableBody.innerHTML = '';
    previewTable.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    previewPlaceholder.querySelector('p').textContent = 'No preview available. Process files to view filtered results.';

    downloadBtn.disabled = true;
    nextSchoolBtn.disabled = true;

    schoolNameInput.value = '';
    schoolNameAutoBadge.style.display = 'none';
    clearSchoolNameBtn.style.display = 'none';
    isSchoolNameAutoDetected = false;

    toggleInputs(false);
    processBtn.disabled = true;

    addConsoleLog('Staging area reset. Ready for next school (e.g. PMShri 1, Uttrakhand 2). Ledger preserved!', 'info');
    showToast('Ready for the next school batch!', 'info');

    uploadZone.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// Full Reset Button Event
resetBtn.addEventListener('click', () => {
    uploadedFiles = [];
    renderFileList();
    updateStatsBoard();

    if (worker) {
        worker.terminate();
        worker = null;
    }

    if (processedBlobUrl) {
        URL.revokeObjectURL(processedBlobUrl);
        processedBlobUrl = null;
    }

    progressBanner.style.display = 'none';
    progressBanner.style.border = '1px solid rgba(99, 102, 241, 0.15)';
    progressBanner.style.background = 'rgba(99, 102, 241, 0.06)';
    
    previewTableBody.innerHTML = '';
    previewTable.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    previewPlaceholder.querySelector('p').textContent = 'No preview available. Process files to view filtered results.';
    
    downloadBtn.disabled = true;
    nextSchoolBtn.disabled = true;
    toggleInputs(false);
    
    actionItemsContainer.innerHTML = '';
    detectedActions = [];
    selectAllCheckbox.checked = false;
    updateSelectedActionsText();
    processBtn.disabled = true;

    schoolNameInput.value = '';
    schoolNameAutoBadge.style.display = 'none';
    clearSchoolNameBtn.style.display = 'none';
    isSchoolNameAutoDetected = false;

    consolePanel.innerHTML = '';
    addConsoleLog('System staging state reset. Upload multiple CSV logs to start processing.', 'info');
    showToast('Staging state reset.', 'info');
});

// ==========================================
// School Record Ledger Management
// ==========================================
function loadSchoolRecords() {
    try {
        const raw = localStorage.getItem(RECORDS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.error('Error loading school records from localStorage:', err);
        return [];
    }
}

function saveSchoolRecords(records) {
    try {
        const sanitized = records.map((r, i) => {
            if (i < records.length - 25) {
                const { csvContent, ...rest } = r;
                return rest;
            }
            return r;
        });
        localStorage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(sanitized));
    } catch (err) {
        console.error('Error saving school records to localStorage:', err);
    }
}

function renderSchoolRecordsLedger() {
    const totalSchools = schoolRecords.length;
    let grandTotalUnique = 0;

    schoolRecords.forEach(rec => {
        grandTotalUnique += (Number(rec.uniqueCount) || 0);
    });

    ledgerSchoolsCount.textContent = totalSchools.toLocaleString();
    ledgerTotalCount.textContent = grandTotalUnique.toLocaleString();

    ledgerTableBody.innerHTML = '';

    if (totalSchools === 0) {
        ledgerTable.style.display = 'none';
        ledgerPlaceholder.style.display = 'block';
        return;
    }

    ledgerPlaceholder.style.display = 'none';
    ledgerTable.style.display = 'table';

    schoolRecords.forEach((rec, index) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-id', rec.id);

        const filesText = rec.filesCount ? `${rec.filesCount} file(s)` : '1 file';

        tr.innerHTML = `
            <td><span class="row-index">${index + 1}</span></td>
            <td>
                <div class="school-name-cell" id="schoolNameCell_${rec.id}">
                    <span class="school-name-text" onclick="window.startInlineEditSchool('${rec.id}')" title="Click to edit school name">${escapeHtml(rec.schoolName)}</span>
                    <button class="btn-inline-edit" onclick="window.startInlineEditSchool('${rec.id}')" title="Edit name">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                </div>
            </td>
            <td style="text-align: right;">
                <span class="unique-count-badge">${Number(rec.uniqueCount).toLocaleString()}</span>
            </td>
            <td><span style="font-size: 0.8rem; color: var(--text-secondary);">${rec.timestamp}</span></td>
            <td><span style="font-size: 0.8rem; color: var(--text-muted);">${filesText}</span></td>
            <td>
                <div class="row-actions-group">
                    ${rec.csvContent ? `
                        <button class="btn-table-action download" onclick="window.downloadSchoolCSV('${rec.id}')" title="Download clean emails for this school">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                    ` : ''}
                    <button class="btn-table-action delete" onclick="window.deleteSchoolRecord('${rec.id}')" title="Delete record from ledger">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </td>
        `;

        ledgerTableBody.appendChild(tr);
    });
}

// Window globally-accessible helpers for table row events
window.startInlineEditSchool = function(id) {
    const record = schoolRecords.find(r => r.id === id);
    if (!record) return;

    const cell = document.getElementById(`schoolNameCell_${id}`);
    if (!cell) return;

    cell.innerHTML = `
        <div class="inline-edit-box">
            <input type="text" class="inline-edit-input" id="inlineInput_${id}" value="${escapeHtml(record.schoolName)}" />
            <button class="btn-inline-save" onclick="window.saveInlineEditSchool('${id}')" title="Save">✓</button>
            <button class="btn-inline-cancel" onclick="renderSchoolRecordsLedger()" title="Cancel">✕</button>
        </div>
    `;

    const input = document.getElementById(`inlineInput_${id}`);
    if (input) {
        input.focus();
        input.select();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') window.saveInlineEditSchool(id);
            if (e.key === 'Escape') renderSchoolRecordsLedger();
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

    const record = schoolRecords.find(r => r.id === id);
    if (record) {
        record.schoolName = newName;
        saveSchoolRecords(schoolRecords);
        renderSchoolRecordsLedger();
        showToast(`Updated school name to "${newName}".`, 'success');
    }
};

window.deleteSchoolRecord = function(id) {
    const record = schoolRecords.find(r => r.id === id);
    if (!record) return;

    if (confirm(`Are you sure you want to delete "${record.schoolName}" from the record ledger?`)) {
        schoolRecords = schoolRecords.filter(r => r.id !== id);
        saveSchoolRecords(schoolRecords);
        renderSchoolRecordsLedger();
        addConsoleLog(`Deleted "${record.schoolName}" from ledger.`, 'info');
        showToast(`Removed "${record.schoolName}" from ledger.`, 'info');
    }
};

window.downloadSchoolCSV = function(id) {
    const record = schoolRecords.find(r => r.id === id);
    if (!record || !record.csvContent) {
        showToast('CSV content not available for this entry.', 'error');
        return;
    }

    const blob = new Blob([record.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const sanitizedName = record.schoolName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizedName}_clean_emails.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Downloaded clean emails for "${record.schoolName}".`, 'success');
};

// ==========================================
// Excel Export (Column A: School Name, Column B: Unique Count)
// ==========================================
downloadRecordExcelBtn.addEventListener('click', () => {
    if (schoolRecords.length === 0) {
        showToast('No school records in ledger to export.', 'error');
        return;
    }

    // Prepare CSV with UTF-8 BOM (\uFEFF) so Microsoft Excel opens it perfectly
    let csv = '\uFEFF';
    // Exact requested columns:
    csv += 'School Name,Unique Count\n';

    let totalSum = 0;
    for (const rec of schoolRecords) {
        const escapedName = (rec.schoolName.includes(',') || rec.schoolName.includes('"') || rec.schoolName.includes('\n'))
            ? `"${rec.schoolName.replace(/"/g, '""')}"`
            : rec.schoolName;
        const count = Number(rec.uniqueCount) || 0;
        csv += `${escapedName},${count}\n`;
        totalSum += count;
    }

    // Add Grand Total row for complete summary
    csv += `Total (${schoolRecords.length} Schools),${totalSum}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `School_Unique_Records_Summary_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    addConsoleLog(`Exported Excel record ledger for ${schoolRecords.length} school(s) (Total unique count: ${totalSum.toLocaleString()}).`, 'success');
    showToast(`Downloaded Excel record ledger for ${schoolRecords.length} schools!`, 'success');
});

// Clear All Records Button
clearAllRecordsBtn.addEventListener('click', () => {
    if (schoolRecords.length === 0) return;
    if (confirm(`Are you sure you want to clear all ${schoolRecords.length} school records from the ledger? This cannot be undone.`)) {
        schoolRecords = [];
        saveSchoolRecords(schoolRecords);
        renderSchoolRecordsLedger();
        addConsoleLog('School records ledger cleared.', 'info');
        showToast('Ledger cleared.', 'info');
    }
});

// ==========================================
// Manual Record Add Modal
// ==========================================
addManualRecordBtn.addEventListener('click', () => {
    manualSchoolNameInput.value = '';
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
    const schoolName = manualSchoolNameInput.value.trim();
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

    const now = new Date();
    const formattedDate = now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const newRecord = {
        id: 'sch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        schoolName: schoolName,
        uniqueCount: count,
        timestamp: formattedDate,
        isoDate: now.toISOString(),
        filesCount: 1,
        fileNames: ['Manual Entry'],
        rawRecords: count,
        csvContent: null
    };

    schoolRecords.push(newRecord);
    saveSchoolRecords(schoolRecords);
    renderSchoolRecordsLedger();

    closeManualModal();
    addConsoleLog(`Manually added "${schoolName}" (${count.toLocaleString()} unique emails) to ledger.`, 'info');
    showToast(`Added "${schoolName}" to ledger!`, 'success');
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

// Escape HTML helper
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
