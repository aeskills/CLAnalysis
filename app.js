// Application Coordinator for CSV Dataflow Admin Console Processor

// State
let uploadedFiles = [];
let worker = null;
let processedBlobUrl = null;

// UI Elements
const uploadZone = document.getElementById('uploadZone');
const fileInput = document.getElementById('fileInput');
const fileList = document.getElementById('fileList');
const emailColumnSelect = document.getElementById('emailColumn');
const actionColumnSelect = document.getElementById('actionColumn');
const actionValuesInput = document.getElementById('actionValues');
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

    // Scan headers of the first file to populate mapping options
    if (uploadedFiles.length > 0) {
        try {
            const headers = await readCSVHeaders(uploadedFiles[0]);
            populateColumnSelectors(headers);
        } catch (err) {
            addConsoleLog(`Failed to parse CSV headers for mapping: ${err.message}`, 'warning');
        }
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
        resetColumnSelectors();
    }
}

// Retrieve headers from the first chunk of a file
function readCSVHeaders(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        // Read first 15KB of file to ensure we get the full header line
        const slice = file.slice(0, 15360);
        reader.onload = () => {
            const text = reader.result;
            const lines = text.split(/\r?\n/);
            if (lines.length > 0 && lines[0].trim()) {
                const headers = parseCSVLine(lines[0]);
                resolve(headers.map(h => h.trim()));
            } else {
                reject(new Error('File appears to be empty or missing headers.'));
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(slice);
    });
}

function populateColumnSelectors(headers) {
    // Preserve auto detect options
    emailColumnSelect.innerHTML = '<option value="auto">Auto-detect (Column D / "User Email")</option>';
    actionColumnSelect.innerHTML = '<option value="auto">Auto-detect (Look for "Action" / "Event")</option>';

    headers.forEach((header, index) => {
        if (!header) return;
        
        const optionEmail = document.createElement('option');
        optionEmail.value = header;
        optionEmail.textContent = `${header} (Col ${index + 1})`;
        emailColumnSelect.appendChild(optionEmail);

        const optionAction = document.createElement('option');
        optionAction.value = header;
        optionAction.textContent = `${header} (Col ${index + 1})`;
        actionColumnSelect.appendChild(optionAction);
    });
    
    addConsoleLog(`Loaded column dropdown configuration with ${headers.length} detected headers.`, 'info');
}

function resetColumnSelectors() {
    emailColumnSelect.innerHTML = '<option value="auto">Auto-detect (Column D / "User Email")</option>';
    actionColumnSelect.innerHTML = '<option value="auto">Auto-detect (Look for "Action" / "Event")</option>';
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
    const emailConfig = emailColumnSelect.value;
    const actionConfig = actionColumnSelect.value;
    const actionValues = actionValuesInput.value;

    // Toggle interactive states
    toggleInputs(true);
    
    // Clear and show processing UI
    progressBanner.style.display = 'block';
    progressStatusText.textContent = `Starting pipeline processing...`;
    progressPercentText.textContent = '0%';
    progressBarFill.style.style = '0%';
    
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
    worker = new Worker('parser-worker.js');

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
    emailColumnSelect.disabled = disabled;
    actionColumnSelect.disabled = disabled;
    actionValuesInput.disabled = disabled;
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
    resetColumnSelectors();
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

    // Log reset
    consolePanel.innerHTML = '';
    addConsoleLog('System state reset. Upload multiple CSV logs to start processing.', 'info');
});
