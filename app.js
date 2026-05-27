// Application Coordinator for CSV Dataflow Admin Console Processor

// State
let uploadedFiles = [];
let worker = null;
let processedBlobUrl = null;

// UI Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const dropdownTrigger = document.getElementById('dropdownTrigger');
const dropdownMenu = document.getElementById('dropdownMenu');
const selectedActionsText = document.getElementById('selectedActionsText');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const checkboxes = document.querySelectorAll('#dropdownMenu input[type="checkbox"]:not(#selectAllCheckbox)');
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

// Process Action trigger
processBtn.addEventListener('click', () => {
    if (uploadedFiles.length === 0) return;

    // UI Configuration state
    const emailConfig = 'auto';
    const actionConfig = 'auto';
    const actionValues = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value)
        .join(', ');

    // Toggle interactive states
    toggleInputs(true);
    
    // Clear and show processing UI
    progressBanner.style.display = 'block';
    progressStatusText.textContent = `Starting pipeline processing...`;
    progressPercentText.textContent = '0%';
    progressBarFill.style.width = '0%';
    
    // Clear preview table and download blob
    previewTable.style.display = 'none';
    previewPlaceholder.style.display = 'block';
    downloadBtn.disabled = true;
    if (processedBlobUrl) {
        URL.revokeObjectURL(processedBlobUrl);
        processedBlobUrl = null;
    }

    addConsoleLog('Initializing background worker thread...', 'info');

    // Create web worker
    worker = new Worker('parser-worker.js?v=1.0.1');

    // Send processing data
    worker.postMessage({
        files: uploadedFiles,
        emailColConfig: emailConfig,
        actionColConfig: actionConfig,
        actionValuesRaw: actionValues
    });

    worker.onmessage = function(e) {
        const { type, percent, fileName, rawRecords, matchingActions, adobeExcluded, cleanEmails, timestamp, message, logType, data } = e.data;

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
                addConsoleLog(e.data.message, e.data.type, e.data.timestamp);
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
    checkboxes.forEach(cb => cb.disabled = disabled);
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
    processBtn.disabled = true; // Block until files or configs change

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
    
    // Reset checkboxes to default values
    selectAllCheckbox.checked = false;
    checkboxes.forEach(cb => {
        if (cb.value === "Read" || cb.value === "Created" || cb.value === "Created public link") {
            cb.checked = true;
        } else {
            cb.checked = false;
        }
    });
    updateSelectedActionsText();

    // Log reset
    consolePanel.innerHTML = '';
    addConsoleLog('System state reset. Upload multiple CSV logs to start processing.', 'info');
});

// --- Custom Multiselect Event Listeners ---
function updateSelectedActionsText() {
    const selected = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.value);
    
    if (selected.length === 0) {
        selectedActionsText.textContent = "Select actions...";
    } else {
        selectedActionsText.textContent = selected.join(', ');
    }
}

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
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
    });
    updateSelectedActionsText();
});

// Listen to checkbox changes
checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
        const allChecked = Array.from(checkboxes).every(c => c.checked);
        selectAllCheckbox.checked = allChecked;
        updateSelectedActionsText();
    });
});
