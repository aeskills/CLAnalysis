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
let loadedOrgExtensions = null; // Official school email extensions loaded from Org_Email_Extensions_Complete.xlsx

const WEEKLY_STORAGE_KEY = 'dataflow_weekly_school_records_v1';
const LEGACY_STORAGE_KEY = 'dataflow_school_records_v1';

let weeklyRecords = loadWeeklyRecords();
let activeWeekRange = null;

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

// Calendar Picker Elements
const calendarToggleBtn = document.getElementById('calendarToggleBtn');
const calendarDropdown = document.getElementById('calendarDropdown');
const calMonthTitle = document.getElementById('calMonthTitle');
const calPrevMonth = document.getElementById('calPrevMonth');
const calNextMonth = document.getElementById('calNextMonth');
const calDaysGrid = document.getElementById('calDaysGrid');
const calModeWeek = document.getElementById('calModeWeek');
const calModeCustom = document.getElementById('calModeCustom');
const calPresetThisWeek = document.getElementById('calPresetThisWeek');
const calPresetLastWeek = document.getElementById('calPresetLastWeek');
const calCloseBtn = document.getElementById('calCloseBtn');

const dropdownTrigger = document.getElementById('dropdownTrigger');
const dropdownMenu = document.getElementById('dropdownMenu');
const selectedActionsText = document.getElementById('selectedActionsText');
const selectAllCheckbox = document.getElementById('selectAllCheckbox');
const actionItemsContainer = document.getElementById('actionItemsContainer');
const processBtn = document.getElementById('processBtn');
const resetBtn = document.getElementById('resetBtn');
const nextBatchBtn = document.getElementById('nextBatchBtn');

// Unified Download Controls
const unifiedDownloadBtn = document.getElementById('unifiedDownloadBtn');
const unifiedDownloadMenu = document.getElementById('unifiedDownloadMenu');
const btnDownloadCombined = document.getElementById('btnDownloadCombined');
const btnDownloadSeparate = document.getElementById('btnDownloadSeparate');
const btnDownloadExcel = document.getElementById('btnDownloadExcel');

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

const clearWeekRecordsBtn = document.getElementById('clearWeekRecordsBtn');
const clearAllRecordsBtn = document.getElementById('clearAllRecordsBtn');

// Toast Container
const toastContainer = document.getElementById('toastContainer');

// ==========================================
// Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    activeWeekRange = getInitialActiveWeek();

    // If no week range is filled, prefill with active week or default range
    if (!weekDateRangeInput.value.trim()) {
        weekDateRangeInput.value = activeWeekRange;
        clearWeekRangeBtn.style.display = 'block';
    }

    renderWeeklyTabs();
    renderWeeklyLedger();

    // Load official school extensions from Org_Email_Extensions_Complete.xlsx
    loadDefaultOrgExtensionsFromExcel();
});

// ==========================================
// Official School Org Extensions Engine
// ==========================================
function extractExtensionsFromWorkbook(workbook) {
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) return null;
    const sheetName = workbook.SheetNames.includes('Extensions') ? 'Extensions' : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return null;

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    if (!rows || rows.length === 0) return null;

    const map = {};
    let orgCol = -1;
    let extCol = -1;

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!Array.isArray(row)) continue;

        // Detect header row columns
        for (let c = 0; c < row.length; c++) {
            const val = String(row[c] || '').trim().toLowerCase();
            if (val === 'org' || val === 'school' || val === 'school name' || val === 'organization') orgCol = c;
            if (val === 'email extension' || val === 'extension' || val === 'domain' || val === 'email domain') extCol = c;
        }

        if (orgCol !== -1 && extCol !== -1 && r > 0) {
            const org = String(row[orgCol] || '').trim();
            let ext = String(row[extCol] || '').trim().toLowerCase();
            if (ext.startsWith('@')) ext = ext.slice(1);
            if (org && ext && ext.includes('.') && !ext.includes('email extension')) {
                map[ext] = org;
            }
        }
    }
    return Object.keys(map).length > 0 ? map : null;
}

async function loadDefaultOrgExtensionsFromExcel() {
    try {
        const response = await fetch('Org_Email_Extensions_Complete.xlsx');
        if (!response.ok) return;
        const arrayBuffer = await response.arrayBuffer();
        if (typeof XLSX !== 'undefined') {
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const extMap = extractExtensionsFromWorkbook(workbook);
            if (extMap && Object.keys(extMap).length > 0) {
                loadedOrgExtensions = extMap;
                addConsoleLog(`Loaded ${Object.keys(extMap).length} official school extensions from Org_Email_Extensions_Complete.xlsx`, 'info');
            }
        }
    } catch (e) {
        // Built-in dictionary in worker handles mappings seamlessly
        console.log('Using default built-in org extensions mapping', e);
    }
}

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
    if (weeklyRecords && weeklyRecords.length > 0) {
        return weeklyRecords[0].weekRange;
    }
    return getWeekDateRangeString(0);
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
    setWeekDateRange(val);
    showToast(`Week date range set to: ${val}`, 'info');
});

btnPresetLastWeek.addEventListener('click', () => {
    const val = getWeekDateRangeString(-1);
    setWeekDateRange(val);
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
// Interactive Week & Date Range Calendar Picker
// ==========================================
let calCurrentDate = new Date();
let calMode = 'week'; // 'week' or 'custom'
let calCustomStart = null;
let calCustomEnd = null;

function isSameDate(d1, d2) {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function setWeekDateRange(val) {
    if (!weekDateRangeInput) return;
    weekDateRangeInput.value = val;
    if (clearWeekRangeBtn) clearWeekRangeBtn.style.display = 'block';
    weekDateRangeInput.dispatchEvent(new Event('input', { bubbles: true }));
}

function selectWeekFromDate(date) {
    const target = new Date(date);
    const day = target.getDay(); // 0 is Sun, 1 is Mon
    const diffToMonday = day === 0 ? -6 : 1 - day;
    
    const monday = new Date(target);
    monday.setDate(target.getDate() + diffToMonday);
    
    // 6-day academic/work week (Mon - Sat)
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);

    const formattedRange = `${formatOrdinalDate(monday)} - ${formatOrdinalDate(saturday)}`;
    setWeekDateRange(formattedRange);
    renderCalendarGrid();
    setTimeout(closeCalendar, 200);
    showToast(`Week selected: ${formattedRange}`, 'info');
}

function handleCustomRangeClick(date) {
    if (!calCustomStart || (calCustomStart && calCustomEnd)) {
        calCustomStart = date;
        calCustomEnd = null;
        renderCalendarGrid();
    } else {
        calCustomEnd = date;
        const start = calCustomStart < calCustomEnd ? calCustomStart : calCustomEnd;
        const end = calCustomStart < calCustomEnd ? calCustomEnd : calCustomStart;
        
        const formattedRange = `${formatOrdinalDate(start)} - ${formatOrdinalDate(end)}`;
        setWeekDateRange(formattedRange);
        renderCalendarGrid();
        setTimeout(closeCalendar, 200);
        showToast(`Date range selected: ${formattedRange}`, 'info');
    }
}

function renderCalendarGrid() {
    if (!calDaysGrid || !calMonthTitle) return;
    calDaysGrid.innerHTML = '';

    const year = calCurrentDate.getFullYear();
    const month = calCurrentDate.getMonth();

    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];
    calMonthTitle.textContent = `${monthNames[month]} ${year}`;

    // First day of month (0 = Sun, 1 = Mon ... 6 = Sat)
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Convert Sunday=0 to Monday=0:
    let startDayOfWeek = firstDay.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const totalDays = lastDay.getDate();
    const prevMonthLastDay = new Date(year, month, 0).getDate();

    const today = new Date();
    const isThisMonth = today.getFullYear() === year && today.getMonth() === month;

    const days = [];

    // Previous month overflow days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const d = new Date(year, month - 1, prevMonthLastDay - i);
        days.push({ date: d, isCurrentMonth: false });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
        const d = new Date(year, month, i);
        days.push({ date: d, isCurrentMonth: true });
    }

    // Next month overflow days
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push({ date: d, isCurrentMonth: false });
    }

    days.forEach((dayObj, index) => {
        const cell = document.createElement('div');
        cell.className = 'cal-day-cell';
        if (!dayObj.isCurrentMonth) cell.classList.add('other-month');

        const dNum = dayObj.date.getDate();
        cell.textContent = dNum;
        cell.dataset.date = dayObj.date.toISOString();
        cell.dataset.weekRow = Math.floor(index / 7);

        if (isThisMonth && dayObj.isCurrentMonth && dNum === today.getDate()) {
            cell.classList.add('today');
        }

        // Custom range active markers
        if (calCustomStart && !calCustomEnd) {
            if (isSameDate(dayObj.date, calCustomStart)) {
                cell.classList.add('range-start');
            }
        } else if (calCustomStart && calCustomEnd) {
            const start = calCustomStart < calCustomEnd ? calCustomStart : calCustomEnd;
            const end = calCustomStart < calCustomEnd ? calCustomEnd : calCustomStart;
            if (isSameDate(dayObj.date, start)) cell.classList.add('range-start');
            if (isSameDate(dayObj.date, end)) cell.classList.add('range-end');
            if (dayObj.date > start && dayObj.date < end) cell.classList.add('in-range');
        }

        // Hover events
        cell.addEventListener('mouseenter', () => {
            if (calMode === 'week') {
                const row = cell.dataset.weekRow;
                calDaysGrid.querySelectorAll(`.cal-day-cell[data-week-row="${row}"]`).forEach(c => {
                    c.classList.add('week-hover');
                });
            } else if (calMode === 'custom' && calCustomStart && !calCustomEnd) {
                const hoverDate = dayObj.date;
                const start = calCustomStart < hoverDate ? calCustomStart : hoverDate;
                const end = calCustomStart < hoverDate ? hoverDate : calCustomStart;
                calDaysGrid.querySelectorAll('.cal-day-cell').forEach(c => {
                    const cDate = new Date(c.dataset.date);
                    if (cDate >= start && cDate <= end) {
                        c.classList.add('in-range');
                    } else {
                        c.classList.remove('in-range');
                    }
                });
            }
        });

        cell.addEventListener('mouseleave', () => {
            if (calMode === 'week') {
                calDaysGrid.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('week-hover'));
            }
        });

        cell.addEventListener('click', (e) => {
            e.stopPropagation();
            if (calMode === 'week') {
                selectWeekFromDate(dayObj.date);
            } else {
                handleCustomRangeClick(dayObj.date);
            }
        });

        calDaysGrid.appendChild(cell);
    });
}

function openCalendar() {
    if (!calendarDropdown) return;
    calendarDropdown.style.display = 'block';
    renderCalendarGrid();
}

function closeCalendar() {
    if (!calendarDropdown) return;
    calendarDropdown.style.display = 'none';
}

function toggleCalendar() {
    if (!calendarDropdown) return;
    if (calendarDropdown.style.display === 'block') {
        closeCalendar();
    } else {
        openCalendar();
    }
}

if (calendarToggleBtn) {
    calendarToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCalendar();
    });
}

if (weekDateRangeInput) {
    weekDateRangeInput.addEventListener('click', (e) => {
        e.stopPropagation();
        if (calendarDropdown && calendarDropdown.style.display !== 'block') {
            openCalendar();
        }
    });
}

if (calPrevMonth) {
    calPrevMonth.addEventListener('click', (e) => {
        e.stopPropagation();
        calCurrentDate.setMonth(calCurrentDate.getMonth() - 1);
        renderCalendarGrid();
    });
}

if (calNextMonth) {
    calNextMonth.addEventListener('click', (e) => {
        e.stopPropagation();
        calCurrentDate.setMonth(calCurrentDate.getMonth() + 1);
        renderCalendarGrid();
    });
}

if (calModeWeek) {
    calModeWeek.addEventListener('click', (e) => {
        e.stopPropagation();
        calMode = 'week';
        calModeWeek.classList.add('active');
        if (calModeCustom) calModeCustom.classList.remove('active');
        calCustomStart = null;
        calCustomEnd = null;
        renderCalendarGrid();
    });
}

if (calModeCustom) {
    calModeCustom.addEventListener('click', (e) => {
        e.stopPropagation();
        calMode = 'custom';
        calModeCustom.classList.add('active');
        if (calModeWeek) calModeWeek.classList.remove('active');
        calCustomStart = null;
        calCustomEnd = null;
        renderCalendarGrid();
    });
}

if (calPresetThisWeek) {
    calPresetThisWeek.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = getWeekDateRangeString(0);
        setWeekDateRange(val);
        closeCalendar();
        showToast(`Week date range set to: ${val}`, 'info');
    });
}

if (calPresetLastWeek) {
    calPresetLastWeek.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = getWeekDateRangeString(-1);
        setWeekDateRange(val);
        closeCalendar();
        showToast(`Week date range set to: ${val}`, 'info');
    });
}

if (calCloseBtn) {
    calCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeCalendar();
    });
}

document.addEventListener('click', (e) => {
    if (calendarDropdown && calendarDropdown.style.display === 'block') {
        if (!calendarDropdown.contains(e.target) && 
            (!calendarToggleBtn || !calendarToggleBtn.contains(e.target)) && 
            e.target !== weekDateRangeInput) {
            closeCalendar();
        }
    }
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
    // 1. Check for Excel school extension files (.xlsx, .xls)
    const excelFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls'));
    if (excelFiles.length > 0) {
        for (const ef of excelFiles) {
            try {
                const arrayBuf = await ef.arrayBuffer();
                if (typeof XLSX !== 'undefined') {
                    const wb = XLSX.read(arrayBuf, { type: 'array' });
                    const extMap = extractExtensionsFromWorkbook(wb);
                    if (extMap && Object.keys(extMap).length > 0) {
                        loadedOrgExtensions = extMap;
                        addConsoleLog(`Loaded ${Object.keys(extMap).length} school extension mappings from "${ef.name}".`, 'success');
                        showToast(`Loaded ${Object.keys(extMap).length} school extensions from "${ef.name}"!`, 'success');
                    } else {
                        showToast(`No school extension mappings found in "${ef.name}".`, 'warning');
                    }
                }
            } catch (err) {
                console.error('Error parsing uploaded Excel file:', err);
                showToast(`Failed to parse "${ef.name}": ${err.message}`, 'error');
            }
        }
    }

    // 2. Filter CSV log files
    const csvFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.csv') || f.type.includes('csv') || f.type === 'text/plain');

    if (csvFiles.length === 0) {
        if (excelFiles.length > 0) {
            return; // Successfully updated extensions without needing CSV logs
        }
        showToast('Please upload CSV log files or school extension Excel files (.xlsx).', 'error');
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
    
    unifiedDownloadBtn.disabled = true;
    nextBatchBtn.disabled = true;

    if (masterBlobUrl) {
        URL.revokeObjectURL(masterBlobUrl);
        masterBlobUrl = null;
    }

    addConsoleLog(`Starting weekly multi-school analysis for week "${weekRange}" (${uploadedFiles.length} file(s))...`, 'info');
    addConsoleLog(`Active action filters: ${actionValues}`, 'info');

    worker = new Worker('parser-worker.js?v=3.1.0');

    worker.postMessage({
        files: uploadedFiles,
        emailColConfig: 'auto',
        actionColConfig: 'auto',
        actionValuesRaw: actionValues,
        customOrgExtensions: loadedOrgExtensions
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

    // Save current batch schools
    currentBatchSchools = result.schoolsList;

    // Set Master Combined CSV Blob
    const masterBlob = new Blob([result.masterCsvContent], { type: 'text/csv;charset=utf-8;' });
    masterBlobUrl = URL.createObjectURL(masterBlob);
    unifiedDownloadBtn.disabled = false;
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

// ==========================================
// Unified Single Download Controller (Combined, Separate, Excel)
// ==========================================
unifiedDownloadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (unifiedDownloadBtn.disabled) return;
    const isVisible = unifiedDownloadMenu.style.display === 'flex';
    unifiedDownloadMenu.style.display = isVisible ? 'none' : 'flex';
    unifiedDownloadBtn.classList.toggle('active', !isVisible);
});

document.addEventListener('click', (e) => {
    if (!unifiedDownloadBtn.contains(e.target) && !unifiedDownloadMenu.contains(e.target)) {
        unifiedDownloadMenu.style.display = 'none';
        unifiedDownloadBtn.classList.remove('active');
    }
});

btnDownloadCombined.addEventListener('click', () => {
    unifiedDownloadMenu.style.display = 'none';
    unifiedDownloadBtn.classList.remove('active');
    downloadMasterCsv();
});

btnDownloadSeparate.addEventListener('click', () => {
    unifiedDownloadMenu.style.display = 'none';
    unifiedDownloadBtn.classList.remove('active');
    downloadAllSeparateCsvs();
});

btnDownloadExcel.addEventListener('click', () => {
    unifiedDownloadMenu.style.display = 'none';
    unifiedDownloadBtn.classList.remove('active');
    if (typeof XLSX !== 'undefined') {
        exportMultiSheetExcel();
    } else {
        exportFallbackMultiWeekCsv();
    }
});

function downloadMasterCsv() {
    let weekName = activeWeekRange || 'Weekly';

    if (masterBlobUrl) {
        const sanitizedRange = weekName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
        const dateStr = new Date().toISOString().slice(0, 10);
        const link = document.createElement('a');
        link.href = masterBlobUrl;
        link.download = `All_Schools_Clean_Emails_${sanitizedRange}_${dateStr}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addConsoleLog(`Downloaded combined clean CSV for "${weekName}".`, 'success');
        showToast(`Downloaded combined CSV for "${weekName}"!`, 'success');
        return;
    }

    // On-the-fly generation from active week's schools if masterBlobUrl isn't in memory
    const activeWeek = weeklyRecords.find(w => activeWeekRange && w.weekRange.toLowerCase() === activeWeekRange.toLowerCase()) || weeklyRecords[0];
    if (!activeWeek || !activeWeek.schools || activeWeek.schools.length === 0) {
        showToast('No school records available to download.', 'error');
        return;
    }

    let combinedRows = "User Email,School Name,Extension\n";
    const emailSet = new Set();
    activeWeek.schools.forEach(sch => {
        if (sch.csvContent) {
            const lines = sch.csvContent.split(/\r?\n/).slice(1);
            lines.forEach(line => {
                const em = line.trim().replace(/^"|"$/g, '');
                if (em && !emailSet.has(em)) {
                    emailSet.add(em);
                    const escaped = em.includes(',') ? `"${em}"` : em;
                    const schEscaped = sch.schoolName.includes(',') ? `"${sch.schoolName}"` : sch.schoolName;
                    combinedRows += `${escaped},${schEscaped},${sch.extension}\n`;
                }
            });
        }
    });

    const blob = new Blob([combinedRows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const sanitizedRange = weekName.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const dateStr = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `All_Schools_Clean_Emails_${sanitizedRange}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    addConsoleLog(`Downloaded combined clean CSV for "${weekName}".`, 'success');
    showToast(`Downloaded combined CSV for "${weekName}"!`, 'success');
}

function downloadAllSeparateCsvs() {
    let activeWeek = weeklyRecords.find(w => activeWeekRange && w.weekRange.toLowerCase() === activeWeekRange.toLowerCase());
    if (!activeWeek && weeklyRecords.length > 0) activeWeek = weeklyRecords[0];

    if (!activeWeek || !activeWeek.schools || activeWeek.schools.length === 0) {
        showToast('No schools in current week to download.', 'error');
        return;
    }

    let downloadCount = 0;
    activeWeek.schools.forEach((sch, i) => {
        if (sch.csvContent) {
            downloadCount++;
            setTimeout(() => {
                window.downloadSchoolCSV(sch.id);
            }, i * 250);
        }
    });

    if (downloadCount > 0) {
        addConsoleLog(`Triggered separate clean CSV downloads for ${downloadCount} school(s) in week "${activeWeek.weekRange}".`, 'success');
        showToast(`Downloading ${downloadCount} separate clean CSV files for "${activeWeek.weekRange}"!`, 'success');
    } else {
        showToast('No CSV content available for current week schools.', 'info');
    }
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

        if (isActive) {
            requestAnimationFrame(() => {
                tabBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            });
        }
    });
}

// Enable horizontal scrolling with mouse wheel on week tabs bar
if (weekTabsBar) {
    weekTabsBar.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            weekTabsBar.scrollLeft += e.deltaY;
        }
    }, { passive: false });
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
        unifiedDownloadBtn.disabled = true;
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
        unifiedDownloadBtn.disabled = true;
        return;
    }

    unifiedDownloadBtn.disabled = false;
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

    progressBanner.style.display = 'none';
    progressBarFill.style.width = '0%';
    progressPercentText.textContent = '0%';

    if (masterBlobUrl) {
        URL.revokeObjectURL(masterBlobUrl);
        masterBlobUrl = null;
    }
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
        nextBatchBtn.disabled = true;
        showToast('Dashboard reset.', 'info');
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
