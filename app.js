// Application Coordinator for CSV Dataflow Admin Console Processor
// Restored to June 4 Baseline: Content Log Analysis CSV Processor
// Note: All New Level Upgrades are preserved as commented-out code below.

// ==========================================
// Application State (June 4 Baseline)
// ==========================================
let uploadedFiles = [];
let worker = null;
let processedBlobUrl = null;
let detectedActions = []; // Dynamically detected action values from CSV

// ==========================================
// UI Elements (June 4 Baseline)
// ==========================================
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const dropdownTrigger = document.getElementById('dropdownTrigger');
const dropdownMenu = document.getElementById('dropdownMenu');
const selectedActionsText = document.getElementById('selectedActionsText');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const actionItemsContainer = document.getElementById('actionItemsContainer');
const processBtn = document.getElementById('processBtn');
const resetBtn = document.getElementById('resetBtn');
const downloadBtn = document.getElementById('downloadBtn');

const statFiles = document.getElementById('statFiles');
const statProcessed = document.getElementById('statProcessed');
const statFiltered = document.getElementById('statFiltered');
const statClean = document.getElementById('statClean');

const progressBanner = document.getElementById('progressBanner');
const progressStatusText = document.getElementById('progressStatusText');
const progressPercentText = document.getElementById('progressPercentText');
const progressBarFill = document.getElementById('progressBarFill');

const consolePanel = document.getElementById('consolePanel');
const previewTable = document.getElementById('previewTable');
const previewTableBody = document.getElementById('previewTableBody');
const previewPlaceholder = document.getElementById('previewPlaceholder');

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

// ==========================================
// Dynamic Action Detection from CSV Files
// ==========================================

// Detect the action column index from headers
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

// Scan uploaded files to find unique action values
async function scanForActionValues(files) {
    const actionSet = new Set();
    
    for (const file of files) {
        // Read a sample from each file (first 2MB is plenty to detect all action types)
        const sampleSize = Math.min(file.size, 2 * 1024 * 1024);
        const slice = file.slice(0, sampleSize);
        const text = await readBlobAsText(slice);
        
        const lines = text.split(/\r?\n/);
        if (lines.length < 2) continue;
        
        // Parse header
        const headers = parseCSVLine(lines[0]);
        const actionColIdx = detectActionColumnIndex(headers);
        
        if (actionColIdx === -1) {
            addConsoleLog(`Could not detect action column in "${file.name}". Headers: ${headers.join(', ')}`, 'error');
            continue;
        }
        
        // Scan data rows for unique action values
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

// Build the dropdown checkboxes dynamically from detected action values
function populateActionDropdown(actions, selectAll = true) {
    actionItemsContainer.innerHTML = '';
    detectedActions = actions;
    
    actions.forEach(action => {
        const label = document.createElement('label');
        label.className = 'dropdown-item';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = action;
        checkbox.checked = selectAll; // Select all by default on first detection
        
        const span = document.createElement('span');
        span.textContent = action;
        
        label.appendChild(checkbox);
        label.appendChild(span);
        actionItemsContainer.appendChild(label);
        
        // Attach change listener
        checkbox.addEventListener('change', () => {
            const allCheckboxes = getActionCheckboxes();
            const allChecked = allCheckboxes.every(c => c.checked);
            selectAllCheckbox.checked = allChecked;
            updateSelectedActionsText();
            
            // Enable process button if we have files and at least one checkbox is selected
            const hasChecked = allCheckboxes.some(cb => cb.checked);
            processBtn.disabled = !hasChecked || uploadedFiles.length === 0;
        });
    });
    
    // Update select all state
    selectAllCheckbox.checked = selectAll;
    updateSelectedActionsText();
}

// Get all dynamically created action checkboxes
function getActionCheckboxes() {
    return Array.from(actionItemsContainer.querySelectorAll('input[type="checkbox"]'));
}

// Update the selected actions text display
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
// File Upload & Handling (June 4 Baseline)
// ==========================================

// Drag & drop handlers
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

// Process Selected Files
async function handleFileSelection(fileListObj) {
    const newFiles = Array.from(fileListObj).filter(file => file.name.endsWith('.csv'));
    
    if (newFiles.length === 0) {
        addConsoleLog('Selected files are not valid CSV format.', 'error');
        return;
    }

    uploadedFiles = [...uploadedFiles, ...newFiles];
    addConsoleLog(`Added ${newFiles.length} CSV file(s). Total files: ${uploadedFiles.length}.`, 'info');
    
    // Update UI lists and controls
    renderFileList();
    updateStatsBoard();
    
    // Scan all uploaded files for action values and populate dropdown
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

// Render files inside the uploaded files list card
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
            <button class="file-remove" data-index="${index}">
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
        // Clear the action dropdown if no files remain
        actionItemsContainer.innerHTML = '';
        detectedActions = [];
        selectAllCheckbox.checked = false;
        updateSelectedActionsText();
        processBtn.disabled = true;
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
// Process Action (June 4 Baseline)
// ==========================================

processBtn.addEventListener('click', () => {
    if (uploadedFiles.length === 0) return;

    // Get selected action values from dynamic checkboxes
    const actionCheckboxes = getActionCheckboxes();
    const actionValues = actionCheckboxes
        .filter(cb => cb.checked)
        .map(cb => cb.value)
        .join(', ');

    if (!actionValues) {
        addConsoleLog('No action filters selected. Please select at least one.', 'error');
        return;
    }

    // UI Configuration state
    const emailConfig = 'auto';
    const actionConfig = 'auto';

    // Toggle interactive states
    toggleInputs(true);
    
    // Clear and show processing UI
    progressBanner.style.display = 'block';
    progressStatusText.textContent = 'Analyzing data streams...';
    progressPercentText.textContent = '0%';
    progressBarFill.style.width = '0%';
    downloadBtn.disabled = true;

    // Reset blob URL
    if (processedBlobUrl) {
        URL.revokeObjectURL(processedBlobUrl);
        processedBlobUrl = null;
    }

    addConsoleLog('Initializing background worker thread...', 'info');
    addConsoleLog(`Active filters: ${actionValues}`, 'info');

    // Create web worker
    worker = new Worker('parser-worker.js?v=2.1.0');

    // Send processing data
    worker.postMessage({
        files: uploadedFiles,
        emailColConfig: emailConfig,
        actionColConfig: actionConfig,
        actionValuesRaw: actionValues
    });

    worker.onmessage = function(e) {
        const { type, percent, fileName, rawRecords, matchingActions, adobeExcluded, cleanEmails, timestamp, message, logLevel, data } = e.data;

        switch (type) {
            case 'PROGRESS':
                progressBarFill.style.width = `${percent}%`;
                progressPercentText.textContent = `${percent}%`;
                progressStatusText.textContent = `Parsing "${fileName}" [${percent}%]`;
                
                // Update running stats
                statProcessed.textContent = rawRecords.toLocaleString();
                statFiltered.textContent = matchingActions.toLocaleString();
                statClean.textContent = cleanEmails.toLocaleString();
                break;

            case 'LOG':
                addConsoleLog(e.data.message, e.data.logLevel, e.data.timestamp);
                break;

            case 'COMPLETE':
                addConsoleLog('Pipeline finished successfully.', 'success');
                finishProcessing(e.data.data);
                break;

            case 'ERROR':
                addConsoleLog(`Processing Error: ${e.data.message}`, 'error');
                handleWorkerFailure();
                break;
        }
    };

    worker.onerror = function(err) {
        addConsoleLog(`Worker thread failure: ${err.message}`, 'error');
        handleWorkerFailure();
    };
});

function toggleInputs(disabled) {
    fileInput.disabled = disabled;
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
    
    // Disable file removal buttons
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

function finishProcessing(result) {
    // Hide progress bar spinner
    progressBanner.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    progressBanner.style.background = 'rgba(16, 185, 129, 0.05)';
    progressStatusText.innerHTML = `<span style="color: var(--color-success); font-weight: 600;">Processing Finished</span>`;
    progressBarFill.style.width = '100%';
    progressPercentText.textContent = '100%';
    
    // Update metrics boards
    updateStatsBoard(result.stats);

    // Build Preview Table (up to 100 rows)
    renderPreviewTable(result.previewRows);

    // Save final CSV blob URL for download
    const blob = new Blob([result.csvContent], { type: 'text/csv;charset=utf-8;' });
    processedBlobUrl = URL.createObjectURL(blob);
    downloadBtn.disabled = false;

    // Reset controls state
    toggleInputs(false);
    
    // Keep process button enabled so user can re-process with different filters
    const hasChecked = getActionCheckboxes().some(cb => cb.checked);
    processBtn.disabled = !hasChecked || uploadedFiles.length === 0;

    if (worker) {
        worker.terminate();
        worker = null;
    }
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
            <td><strong>${row.email}</strong></td>
        `;
        previewTableBody.appendChild(tr);
    });

    previewPlaceholder.style.display = 'none';
    previewTable.style.display = 'table';
}

// ==========================================
// Download & Reset (June 4 Baseline)
// ==========================================

// Download Button Event
downloadBtn.addEventListener('click', () => {
    if (!processedBlobUrl) return;
    
    const timestamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = processedBlobUrl;
    link.setAttribute('download', `dataflow_clean_emails_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addConsoleLog('File downloaded successfully.', 'success');
});

// Reset Button Event
resetBtn.addEventListener('click', () => {
    uploadedFiles = [];
    renderFileList();
    updateStatsBoard();

    // Terminate worker if working
    if (worker) {
        worker.terminate();
        worker = null;
    }

    // Revoke URL
    if (processedBlobUrl) {
        URL.revokeObjectURL(processedBlobUrl);
        processedBlobUrl = null;
    }

    // Reset banner and previews
    progressBanner.style.display = 'none';
    progressBanner.style.border = '1px solid rgba(99, 102, 241, 0.15)';
    progressBanner.style.background = 'rgba(99, 102, 241, 0.06)';
    
    previewTableBody.innerHTML = '';
    previewTable.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    previewPlaceholder.querySelector('p').textContent = 'No preview available. Process files to view filtered results.';
    
    downloadBtn.disabled = true;
    toggleInputs(false);
    
    // Clear dynamic action dropdown
    actionItemsContainer.innerHTML = '';
    detectedActions = [];
    selectAllCheckbox.checked = false;
    updateSelectedActionsText();
    processBtn.disabled = true;

    // Log reset
    consolePanel.innerHTML = '';
    addConsoleLog('System state reset. Upload multiple CSV logs to start processing.', 'info');
});

// ==========================================
// Dropdown UI Events (June 4 Baseline)
// ==========================================

// Toggle dropdown visibility
dropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdownTrigger.classList.contains('disabled')) return;
    const isVisible = dropdownMenu.style.display === 'flex';
    dropdownMenu.style.display = isVisible ? 'none' : 'flex';
    dropdownTrigger.classList.toggle('active', !isVisible);
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!dropdownTrigger.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.style.display = 'none';
        dropdownTrigger.classList.remove('active');
    }
});

// Listen to Select All checkbox change
selectAllCheckbox.addEventListener('change', () => {
    const isChecked = selectAllCheckbox.checked;
    const actionCheckboxes = getActionCheckboxes();
    actionCheckboxes.forEach(cb => {
        cb.checked = isChecked;
    });
    updateSelectedActionsText();
    
    // Enable process button if we have files and at least one checkbox is selected
    const hasChecked = actionCheckboxes.some(cb => cb.checked);
    processBtn.disabled = !hasChecked || uploadedFiles.length === 0;
});


/* =========================================================================
   NEW LEVEL UPGRADE CODE (COMMENTED OUT - PRESERVED FOR FUTURE USE)
   Do NOT remove. Keep commented out for future reactivation if needed.
   =========================================================================

// --- State Variables for Weekly Multi-School & Ledger ---
// let currentBatchSchools = [];
// let loadedOrgExtensions = null;
// const WEEKLY_STORAGE_KEY = 'dataflow_weekly_school_records_v1';
// const LEGACY_STORAGE_KEY = 'dataflow_school_records_v1';
// let weeklyRecords = [];
// let activeWeekRange = null;

// --- Calendar Picker Elements & State ---
// const weekDateRangeInput = document.getElementById('weekDateRangeInput');
// const clearWeekRangeBtn = document.getElementById('clearWeekRangeBtn');
// const btnPresetThisWeek = document.getElementById('btnPresetThisWeek');
// const btnPresetLastWeek = document.getElementById('btnPresetLastWeek');
// const calendarToggleBtn = document.getElementById('calendarToggleBtn');
// const calendarDropdown = document.getElementById('calendarDropdown');
// const calMonthTitle = document.getElementById('calMonthTitle');
// const calPrevMonth = document.getElementById('calPrevMonth');
// const calNextMonth = document.getElementById('calNextMonth');
// const calDaysGrid = document.getElementById('calDaysGrid');
// const calModeWeek = document.getElementById('calModeWeek');
// const calModeCustom = document.getElementById('calModeCustom');
// const calPresetThisWeek = document.getElementById('calPresetThisWeek');
// const calPresetLastWeek = document.getElementById('calPresetLastWeek');
// const calCloseBtn = document.getElementById('calCloseBtn');
// let calCurrentDate = new Date();
// let calMode = 'week';
// let calCustomStart = null;
// let calCustomEnd = null;

// --- Unified Download & Ledger Elements ---
// const unifiedDownloadBtn = document.getElementById('unifiedDownloadBtn');
// const unifiedDownloadMenu = document.getElementById('unifiedDownloadMenu');
// const btnDownloadCombined = document.getElementById('btnDownloadCombined');
// const btnDownloadSeparate = document.getElementById('btnDownloadSeparate');
// const btnDownloadExcel = document.getElementById('btnDownloadExcel');
// const nextBatchBtn = document.getElementById('nextBatchBtn');
// const statSchools = document.getElementById('statSchools');
// const ledgerCard = document.getElementById('ledgerCard');
// const weekTabsBar = document.getElementById('weekTabsBar');
// const ledgerActiveWeekDisplay = document.getElementById('ledgerActiveWeekDisplay');
// const ledgerSchoolsCount = document.getElementById('ledgerSchoolsCount');
// const ledgerTotalCount = document.getElementById('ledgerTotalCount');
// const ledgerTable = document.getElementById('ledgerTable');
// const ledgerTableBody = document.getElementById('ledgerTableBody');
// const ledgerPlaceholder = document.getElementById('ledgerPlaceholder');
// const clearWeekRecordsBtn = document.getElementById('clearWeekRecordsBtn');
// const clearAllRecordsBtn = document.getElementById('clearAllRecordsBtn');

// --- Storage & Migration Helpers ---
// function loadWeeklyRecords() {
//     try {
//         const raw = localStorage.getItem(WEEKLY_STORAGE_KEY);
//         if (raw) {
//             const parsed = JSON.parse(raw);
//             if (Array.isArray(parsed)) return parsed;
//         }
//     } catch (e) {
//         console.error('Failed to load weekly records from storage', e);
//     }
//     return [];
// }
// function saveWeeklyRecords(data) {
//     try {
//         localStorage.setItem(WEEKLY_STORAGE_KEY, JSON.stringify(data));
//     } catch (e) {
//         console.error('Failed to save weekly records to storage', e);
//     }
// }
// function getInitialActiveWeek() {
//     if (weeklyRecords && weeklyRecords.length > 0) return weeklyRecords[0].weekRange;
//     return getWeekDateRangeString(0);
// }

// --- Date Formatting (Saturday to Friday Cycle) ---
// function getOrdinalSuffix(day) {
//     if (day > 3 && day < 21) return 'th';
//     switch (day % 10) {
//         case 1:  return 'st';
//         case 2:  return 'nd';
//         case 3:  return 'rd';
//         default: return 'th';
//     }
// }
// function formatOrdinalDate(date) {
//     const day = date.getDate();
//     const suffix = getOrdinalSuffix(day);
//     const month = date.toLocaleDateString('en-US', { month: 'short' });
//     return `${day}${suffix} ${month}`;
// }
// function getWeekDateRangeString(offsetWeeks = 0) {
//     const now = new Date();
//     const currentDay = now.getDay();
//     const diffToSaturday = -((currentDay + 1) % 7);
//     const saturday = new Date(now);
//     saturday.setDate(now.getDate() + diffToSaturday + (offsetWeeks * 7));
//     const friday = new Date(saturday);
//     friday.setDate(saturday.getDate() + 6);
//     return `${formatOrdinalDate(saturday)} - ${formatOrdinalDate(friday)}`;
// }

// --- Calendar Picker Logic ---
// function isSameDate(d1, d2) {
//     if (!d1 || !d2) return false;
//     return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
// }
// function setWeekDateRange(val) {
//     if (!weekDateRangeInput) return;
//     weekDateRangeInput.value = val;
//     if (clearWeekRangeBtn) clearWeekRangeBtn.style.display = 'block';
//     weekDateRangeInput.dispatchEvent(new Event('input', { bubbles: true }));
// }
// function selectWeekFromDate(date) {
//     const target = new Date(date);
//     const day = target.getDay();
//     const diffToSaturday = -((day + 1) % 7);
//     const saturday = new Date(target);
//     saturday.setDate(target.getDate() + diffToSaturday);
//     const friday = new Date(saturday);
//     friday.setDate(saturday.getDate() + 6);
//     const formattedRange = `${formatOrdinalDate(saturday)} - ${formatOrdinalDate(friday)}`;
//     setWeekDateRange(formattedRange);
//     renderCalendarGrid();
//     setTimeout(closeCalendar, 200);
// }
// function renderCalendarGrid() { ... }
// function openCalendar() { ... }
// function closeCalendar() { ... }

// --- Official School Org Extensions Engine ---
// function extractExtensionsFromWorkbook(workbook) {
//     if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) return null;
//     const sheetName = workbook.SheetNames.includes('Extensions') ? 'Extensions' : workbook.SheetNames[0];
//     const sheet = workbook.Sheets[sheetName];
//     if (!sheet) return null;
//     const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
//     if (!rows || rows.length === 0) return null;
//     const map = {};
//     let orgCol = -1, extCol = -1;
//     for (let r = 0; r < rows.length; r++) {
//         const row = rows[r];
//         if (!Array.isArray(row)) continue;
//         for (let c = 0; c < row.length; c++) {
//             const val = String(row[c] || '').trim().toLowerCase();
//             if (val === 'org' || val === 'school') orgCol = c;
//             if (val === 'email extension' || val === 'extension') extCol = c;
//         }
//         if (orgCol !== -1 && extCol !== -1 && r > 0) {
//             const org = String(row[orgCol] || '').trim();
//             let ext = String(row[extCol] || '').trim().toLowerCase();
//             if (ext.startsWith('@')) ext = ext.slice(1);
//             if (org && ext && ext.includes('.') && !ext.includes('email extension')) map[ext] = org;
//         }
//     }
//     return Object.keys(map).length > 0 ? map : null;
// }
// async function loadDefaultOrgExtensionsFromExcel() {
//     try {
//         const response = await fetch('Org_Email_Extensions_Complete.xlsx');
//         if (!response.ok) return;
//         const arrayBuffer = await response.arrayBuffer();
//         if (typeof XLSX !== 'undefined') {
//             const workbook = XLSX.read(arrayBuffer, { type: 'array' });
//             const extMap = extractExtensionsFromWorkbook(workbook);
//             if (extMap) loadedOrgExtensions = extMap;
//         }
//     } catch (e) {}
// }

// --- Multi-School Batch Ledger & SheetJS Export ---
// function saveBatchSchoolsToWeek(weekRange, batchSchools) { ... }
// function renderWeeklyTabs() { ... }
// function renderWeeklyLedger() { ... }
// function exportMultiSheetExcel() { ... }
// function exportFallbackMultiWeekCsv() { ... }
========================================================================= */
