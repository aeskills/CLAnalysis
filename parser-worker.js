// Web Worker for processing large CSV files in the background

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

async function processCSVFiles(files, emailColConfig, actionColConfig, actionFilters) {
    let globalLog = [];
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        globalLog.push({ timestamp, message, type });
        self.postMessage({ type: 'LOG', timestamp, message, type });
    }

    log(`Starting processing of ${files.length} file(s)...`, 'info');

    let totalRawRecords = 0;
    let totalMatchingActions = 0;
    let totalAdobeExcluded = 0;
    
    // Master list of unique email records: { email, originFile, originalRowIndex }
    // We append files in sequence.
    // The user requested:
    // File 1 adds unique emails to Column A.
    // File 2 adds unique emails starting after File 1's last email.
    // At the end, remove duplicates across the entire master list.
    let masterEmails = [];
    let masterEmailsSet = new Set();
    
    // Column indices (detected or mapped)
    let emailColIdx = -1;
    let actionColIdx = -1;
    let headersDetected = false;
    let headersList = [];

    // Helper: read a chunk as text from file
    function readBlobAsText(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(blob);
        });
    }

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
        const file = files[fileIdx];
        log(`Reading File ${fileIdx + 1}/${files.length}: "${file.name}" (${(file.size / (1024 * 1024)).toFixed(2)} MB)...`, 'info');

        const chunkSize = 10 * 1024 * 1024; // 10MB chunks
        let offset = 0;
        let remainder = "";
        let lineCount = 0;
        let isFirstChunk = true;
        let fileRawRecords = 0;

        // Set to track unique emails strictly within this single file
        let fileEmailsSet = new Set();
        let fileFilteredCount = 0;

        while (offset < file.size) {
            const slice = file.slice(offset, offset + chunkSize);
            const textChunk = await readBlobAsText(slice);
            offset += chunkSize;

            // Combine with remainder from previous chunk
            const text = remainder + textChunk;
            const lines = text.split(/\r?\n/);
            
            // The last item in lines is either empty or an incomplete line
            remainder = lines.pop();

            let startIdx = 0;
            if (isFirstChunk && fileIdx === 0) {
                // If it is the very first chunk of the first file, parse headers
                const headerLine = lines[0];
                if (headerLine) {
                    headersList = parseCSVLine(headerLine);
                    log(`Detected CSV headers: ${headersList.join(', ')}`, 'info');
                    
                    // Attempt column detection
                    emailColIdx = detectEmailColumn(headersList, emailColConfig);
                    actionColIdx = detectActionColumn(headersList, actionColConfig);

                    log(`Mapping email column to: ${emailColIdx !== -1 ? `Index ${emailColIdx} ("${headersList[emailColIdx]}")` : 'Not Found'}`, 'info');
                    log(`Mapping action column to: ${actionColIdx !== -1 ? `Index ${actionColIdx} ("${headersList[actionColIdx]}")` : 'Not Found'}`, 'info');
                    
                    headersDetected = true;
                    startIdx = 1; // Skip header line for row processing
                }
                isFirstChunk = false;
            } else if (isFirstChunk && fileIdx > 0) {
                // For subsequent files, skip header line if they have headers
                // Assume same headers, skip first line
                startIdx = 1;
                isFirstChunk = false;
            }

            for (let i = startIdx; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                fileRawRecords++;
                totalRawRecords++;
                
                const fields = parseCSVLine(line);
                
                // If column indices weren't found, perform simple fallback (Column D / Index 3 for email)
                const currentEmailIdx = emailColIdx !== -1 ? emailColIdx : 3;
                const currentActionIdx = actionColIdx !== -1 ? actionColIdx : -1;
                
                const email = fields[currentEmailIdx] ? fields[currentEmailIdx].trim() : '';
                
                // Check action filter
                let actionMatch = false;
                if (currentActionIdx !== -1 && fields[currentActionIdx]) {
                    const actionVal = fields[currentActionIdx].trim().toLowerCase();
                    actionMatch = actionFilters.some(filter => actionVal.includes(filter) || filter.includes(actionVal));
                } else {
                    // Fallback: search across all fields if action column is not defined
                    for (let f = 0; f < fields.length; f++) {
                        if (f === currentEmailIdx) continue;
                        const val = fields[f].trim().toLowerCase();
                        if (actionFilters.some(filter => val.includes(filter) || filter.includes(val))) {
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
                actionMatch = actionFilters.some(filter => actionVal.includes(filter) || filter.includes(actionVal));
            } else {
                for (let f = 0; f < fields.length; f++) {
                    if (f === currentEmailIdx) continue;
                    const val = fields[f].trim().toLowerCase();
                    if (actionFilters.some(filter => val.includes(filter) || filter.includes(val))) {
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

    // Look for action/event columns
    const keywords = ['action', 'event', 'operation', 'activity', 'type', 'permission'];
    for (const kw of keywords) {
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i].toLowerCase().trim();
            if (header === kw || header.includes(kw)) {
                return i;
            }
        }
    }

    return -1; // Worker will search all columns if not found
}
