// Web Worker for CSV dataflow admin console processing (June 4 Baseline)
// High-performance line-by-line streaming parser with Chunked File Streaming

self.onmessage = async function(e) {
    const { files, emailColConfig, actionColConfig, actionValuesRaw } = e.data;
    
    // Parse action values list (e.g. "Read, Create, Create with public Link")
    const actionFilters = actionValuesRaw
        .split(',')
        .map(v => v.trim().toLowerCase())
        .filter(v => v.length > 0);

    try {
        const result = await processCSVFiles(files, emailColConfig, actionColConfig, actionFilters);
        self.postMessage({ type: 'COMPLETE', data: result });
    } catch (err) {
        self.postMessage({ type: 'ERROR', message: err.message });
    }
};

// Custom parser to split a CSV line into fields, handling quotes
function parseCSVLine(text) {
    const fields = [];
    let inQuote = false;
    let field = "";
    
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            if (inQuote && text[i+1] === '"') {
                field += '"'; // Escaped quote
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

/* =========================================================================
   NEW LEVEL UPGRADE: OFFICIAL SCHOOL EXTENSIONS & EXTRACTION (COMMENTED OUT)
   =========================================================================
// Official School Email Extensions Mapping from Org_Email_Extensions_Complete.xlsx
const DEFAULT_OFFICIAL_ORG_EXTENSIONS = {
    "u1.kgbvup.in": "KGBV 2",
    "u1.schooluk.org": "Uttarakhand 2",
    "sgoaedu.org": "South Goa",
    "d1.delhiedu.org": "Delhi Directorate 2",
    "pmshriup.org": "PM SHRI 1",
    "schooluk.org": "Uttarakhand 1",
    "kgbvup.in": "KGBV 1",
    "cmshridl.org": "CM SHRI",
    "swdupedu.in": "Samaj Kalyan",
    "awesv.in": "Vidhyanjali",
    "cv.aeedu.in": "Chinmaya",
    "sfsinstitutionsswip.in": "SFS",
    "awesaps.in": "Army",
    "abs.aeedu.in": "Aditya Birla",
    "kle.aeedu.in": "KLE",
    "aees.aeedu.in": "Atomic Energy",
    "pw.aecurate.in": "Physics Wallah",
    "ggs.aespark.in": "Gajera",
    "desp.aecurate.in": "Deccan",
    "pp.aecurate.in": "Poornaprajna",
    "u2.schooluk.org": "Uttarakhand 3 / CSR",
    "u3.schooluk.org": "Uttarakhand 4 / CSR",
    "u4.schooluk.org": "Uttarakhand 5 / CSR",
    "gf.sledu.in": "SL Gujarat 1",
    "gs.sledu.in": "SL Gujarat 2",
    "hp.sledu.in": "SL Chamba",
    "us.sledu.in": "SL US Uttarakhand 2"
};

// Domain to School Name Extraction Engine
function extractSchoolInfoFromEmail(email, orgExtensionsMap = DEFAULT_OFFICIAL_ORG_EXTENSIONS) {
    if (!email) return null;
    const atIdx = email.lastIndexOf('@');
    if (atIdx === -1) return null;
    
    const domain = email.slice(atIdx + 1).trim().toLowerCase();
    if (!domain) return null;
    
    const extension = '@' + domain;
    let schoolName = '';

    const extLookup = orgExtensionsMap || DEFAULT_OFFICIAL_ORG_EXTENSIONS;

    if (extLookup && extLookup[domain]) {
        schoolName = extLookup[domain];
        return { domain, extension, schoolName, isOfficial: true };
    }

    if (extLookup) {
        const sortedKeys = Object.keys(extLookup).sort((a, b) => b.length - a.length);
        for (const key of sortedKeys) {
            if (domain.endsWith('.' + key)) {
                schoolName = extLookup[key];
                return { domain, extension, schoolName, isOfficial: true };
            }
        }
    }

    if (domain.includes('pmshri')) {
        schoolName = 'PM Shri';
    } else if (domain.includes('goa')) {
        schoolName = domain.includes('dhe') ? 'Goa (DHE)' : (domain.includes('sgoa') ? 'South Goa' : (domain.includes('ngoa') ? 'North Goa' : 'Goa'));
    } else if (domain.includes('delhi') || domain.includes('edudel')) {
        schoolName = 'Delhi';
    } else if (domain.includes('kgbv')) {
        schoolName = 'KGBV';
    } else if (domain.includes('gujarat')) {
        schoolName = 'Gujarat';
    } else if (domain.includes('uk.gov') || domain.includes('uttarakhand') || domain.includes('schooluk')) {
        schoolName = 'Uttarakhand';
    } else if (domain.includes('kvs') || domain.includes('kvsangathan')) {
        schoolName = 'Kendriya Vidyalaya (KVS)';
    } else if (domain.includes('navodaya') || domain.includes('nvshq')) {
        schoolName = 'Navodaya Vidyalaya (NVS)';
    } else if (domain.includes('up.gov') || domain.includes('upsdc')) {
        schoolName = 'Uttar Pradesh';
    } else if (domain.includes('haryana')) {
        schoolName = 'Haryana';
    } else if (domain.includes('kar.nic') || domain.includes('karnataka')) {
        schoolName = 'Karnataka';
    } else if (domain.includes('maharashtra') || domain.includes('maha')) {
        schoolName = 'Maharashtra';
    } else if (domain.includes('assam')) {
        schoolName = 'Assam';
    } else if (domain.includes('kerala')) {
        schoolName = 'Kerala';
    } else if (domain.includes('punjab')) {
        schoolName = 'Punjab';
    } else if (domain.includes('rajasthan')) {
        schoolName = 'Rajasthan';
    } else if (domain.includes('bihar')) {
        schoolName = 'Bihar';
    } else if (domain.includes('mp.gov') || domain.includes('madhyapradesh')) {
        schoolName = 'Madhya Pradesh';
    } else {
        let cleaned = domain
            .replace(/\.(gov|nic|edu|ac|org|co|res)\.in$/i, '')
            .replace(/\.(in|com|org|net|edu|gov|io|ai)$/i, '');
        const parts = cleaned.split('.').filter(p => p.length > 0);
        const mainPart = parts.length > 0 ? parts[parts.length - 1] : cleaned;
        schoolName = mainPart
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        if (!schoolName) schoolName = domain;
    }
    
    return {
        domain,
        extension,
        schoolName,
        isOfficial: false
    };
}
========================================================================= */

async function processCSVFiles(files, emailColConfig, actionColConfig, actionFilters) {
    let globalLog = [];
    function log(message, logLevel = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        globalLog.push({ timestamp, message, logLevel });
        self.postMessage({ type: 'LOG', timestamp, message, logLevel });
    }

    log(`Starting pipeline processing of ${files.length} file(s)...`, 'info');

    let totalRawRecords = 0;
    let totalMatchingActions = 0;
    let totalAdobeExcluded = 0;
    
    // Master collection of records to be deduplicated: array of { email, originFile }
    const masterEmails = [];
    
    // Column indices (detected or mapped)
    let emailColIdx = -1;
    let actionColIdx = -1;
    let headersList = [];

    // Helper reader to read chunks as text
    const decoder = new TextDecoder("utf-8");

    // Process each file sequentially
    for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx];
        log(`Reading and processing file [${fIdx + 1}/${files.length}]: "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB)...`, 'info');

        const chunkSize = 4 * 1024 * 1024; // 4MB chunks
        let offset = 0;
        let remainder = "";
        let isFirstLine = true;
        let fileRawRecords = 0;
        let fileFilteredCount = 0;

        // Set to track unique emails within this individual file
        const fileEmailsSet = new Set();

        while (offset < file.size) {
            const slice = file.slice(offset, offset + chunkSize);
            const buffer = await slice.arrayBuffer();
            const textChunk = decoder.decode(buffer, { stream: offset + chunkSize < file.size });
            offset += chunkSize;

            const fullText = remainder + textChunk;
            const lines = fullText.split(/\r?\n/);
            
            // The last item might be incomplete; save it for the next chunk
            remainder = lines.pop();

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;

                if (isFirstLine) {
                    isFirstLine = false;
                    headersList = parseCSVLine(line);
                    
                    // Detect column indices based on user config or auto-discovery
                    emailColIdx = detectEmailColumn(headersList, emailColConfig);
                    actionColIdx = detectActionColumn(headersList, actionColConfig);

                    log(`File headers parsed: Email column index = ${emailColIdx} ("${headersList[emailColIdx] || 'default'}"), Action column index = ${actionColIdx} ("${headersList[actionColIdx] || 'search across'}")`, 'info');
                    continue; // Skip header row from data processing
                }

                totalRawRecords++;
                fileRawRecords++;

                const fields = parseCSVLine(line);
                
                // If column indices weren't found, perform simple fallback (Column D / Index 3 for email)
                const currentEmailIdx = emailColIdx !== -1 ? emailColIdx : 3;
                const currentActionIdx = actionColIdx !== -1 ? actionColIdx : -1;
                
                const email = fields[currentEmailIdx] ? fields[currentEmailIdx].trim() : '';
                
                // Check action filter using EXACT case-insensitive match
                let actionMatch = false;
                if (currentActionIdx !== -1 && fields[currentActionIdx]) {
                    const actionVal = fields[currentActionIdx].trim().toLowerCase();
                    actionMatch = actionFilters.some(filter => actionVal === filter);
                } else {
                    // Fallback: search across all fields if action column is not defined
                    for (let f = 0; f < fields.length; f++) {
                        if (f === currentEmailIdx) continue;
                        const val = fields[f].trim().toLowerCase();
                        if (actionFilters.some(filter => val === filter)) {
                            actionMatch = true;
                            break;
                        }
                    }
                }

                if (actionMatch) {
                    totalMatchingActions++;
                    
                    if (email) {
                        if (email.toLowerCase().includes('@adobe.com')) {
                            totalAdobeExcluded++;
                        } else {
                            // Valid non-adobe email matching filter
                            const lowerEmail = email.toLowerCase();
                            if (!fileEmailsSet.has(lowerEmail)) {
                                fileEmailsSet.add(lowerEmail);
                                fileFilteredCount++;
                            }
                        }
                    }
                }
            }

            // Report progress for this file
            const fileProgress = Math.min(100, (offset / file.size) * 100);
            self.postMessage({
                type: 'PROGRESS',
                fileName: file.name,
                percent: fileProgress.toFixed(0),
                rawRecords: totalRawRecords,
                matchingActions: totalMatchingActions,
                adobeExcluded: totalAdobeExcluded,
                cleanEmails: masterEmails.length + fileEmailsSet.size
            });
        }

        // Process any final remaining line in the file
        if (remainder.trim()) {
            const fields = parseCSVLine(remainder.trim());
            const currentEmailIdx = emailColIdx !== -1 ? emailColIdx : 3;
            const currentActionIdx = actionColIdx !== -1 ? actionColIdx : -1;
            const email = fields[currentEmailIdx] ? fields[currentEmailIdx].trim() : '';
            
            let actionMatch = false;
            if (currentActionIdx !== -1 && fields[currentActionIdx]) {
                const actionVal = fields[currentActionIdx].trim().toLowerCase();
                actionMatch = actionFilters.some(filter => actionVal === filter);
            } else {
                for (let f = 0; f < fields.length; f++) {
                    if (f === currentEmailIdx) continue;
                    const val = fields[f].trim().toLowerCase();
                    if (actionFilters.some(filter => val === filter)) {
                        actionMatch = true;
                        break;
                    }
                }
            }

            if (actionMatch) {
                totalMatchingActions++;
                if (email) {
                    if (email.toLowerCase().includes('@adobe.com')) {
                        totalAdobeExcluded++;
                    } else {
                        const lowerEmail = email.toLowerCase();
                        if (!fileEmailsSet.has(lowerEmail)) {
                            fileEmailsSet.add(lowerEmail);
                            fileFilteredCount++;
                        }
                    }
                }
            }
        }

        // We finished the file. Let's record the row indices and append unique emails from this file
        const startRowIdx = masterEmails.length + 1;
        const fileEmailsArr = Array.from(fileEmailsSet);
        
        for (const email of fileEmailsArr) {
            masterEmails.push({
                email: email,
                originFile: file.name
            });
        }
        
        const endRowIdx = masterEmails.length;
        
        log(`Finished file "${file.name}". Contributed unique records to new CSV row indices: [${startRowIdx} - ${endRowIdx}] (Count: ${fileEmailsArr.length})`, 'success');
    }

    // Now perform final deduplication on the combined master list
    log('Processing completed for all files. Running final cross-file deduplication on User Email (Column A)...', 'info');
    
    const finalCleanEmails = [];
    const finalCleanSet = new Set();
    let crossFileDuplicatesCount = 0;

    for (const record of masterEmails) {
        const emailLower = record.email.toLowerCase();
        if (!finalCleanSet.has(emailLower)) {
            finalCleanSet.add(emailLower);
            finalCleanEmails.push(record);
        } else {
            crossFileDuplicatesCount++;
        }
    }

    log(`Final cross-file deduplication removed ${crossFileDuplicatesCount} duplicate email(s).`, 'success');
    log(`Master list contains ${finalCleanEmails.length} unique emails.`, 'success');

    // Create the clean CSV content
    // Header: User Email
    let csvContent = "User Email\n";
    for (const record of finalCleanEmails) {
        // Simple escaping just in case
        const escapedEmail = record.email.includes(',') ? `"${record.email}"` : record.email;
        csvContent += `${escapedEmail}\n`;
    }

    /* =========================================================================
       NEW LEVEL UPGRADE: MULTI-SCHOOL LIST RETURN FORMAT (COMMENTED OUT)
       =========================================================================
    // Build Master Combined CSV & Schools List
    // let masterCsv = "User Email,School Name,Extension\n";
    // for (const rec of masterEmailList) {
    //     masterCsv += `${rec.email},${rec.schoolName},${rec.extension}\n`;
    // }
    // return {
    //     schoolsList,
    //     masterCsvContent: masterCsv,
    //     stats: { totalRawRecords, totalMatchingActions, totalAdobeExcluded, finalCleanCount: masterEmailSet.size, schoolsCount: schoolsList.length, filesProcessed: files.length },
    //     previewRows: masterEmailList.slice(0, 100),
    //     logs: globalLog
    // };
    ========================================================================= */

    return {
        csvContent,
        stats: {
            totalRawRecords,
            totalMatchingActions,
            totalAdobeExcluded,
            finalCleanCount: finalCleanEmails.length,
            filesProcessed: files.length
        },
        previewRows: finalCleanEmails.slice(0, 100),
        headersList
    };
}

// Helpers for detecting columns
function detectEmailColumn(headers, configValue) {
    if (configValue !== 'auto') {
        const idx = headers.indexOf(configValue);
        if (idx !== -1) return idx;
        const idxNum = parseInt(configValue);
        if (!isNaN(idxNum) && idxNum >= 0 && idxNum < headers.length) return idxNum;
    }
    
    // Look for exact "user email" or "email"
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i].toLowerCase().trim();
        if (header === 'user email' || header === 'email' || header === 'user_email') {
            return i;
        }
    }
    
    // Look for match containing email
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i].toLowerCase();
        if (header.includes('email') || header.includes('mail')) {
            return i;
        }
    }

    // Default to Column D (index 3)
    return 3;
}

function detectActionColumn(headers, configValue) {
    if (configValue !== 'auto') {
        const idx = headers.indexOf(configValue);
        if (idx !== -1) return idx;
        const idxNum = parseInt(configValue);
        if (!isNaN(idxNum) && idxNum >= 0 && idxNum < headers.length) return idxNum;
    }

    // 1. Check exact matches first
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

    // 2. Check partial matches, ignoring time/date/id/user/ip columns
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

    return -1; // Worker will search all columns if not found
}
