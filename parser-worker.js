// Web Worker for multi-school content dump processing
// Extracts schools and extensions from email domains and calculates unique counts per school

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

// Domain to School Name Extraction Engine
function extractSchoolInfoFromEmail(email) {
    if (!email) return null;
    const atIdx = email.lastIndexOf('@');
    if (atIdx === -1) return null;
    
    const domain = email.slice(atIdx + 1).trim().toLowerCase();
    if (!domain) return null;
    
    const extension = '@' + domain;
    
    // Check known domain mappings
    let schoolName = '';
    
    if (domain.includes('pmshri')) {
        schoolName = 'PM Shri';
    } else if (domain.includes('goa')) {
        schoolName = domain.includes('dhe') ? 'Goa (DHE)' : 'Goa';
    } else if (domain.includes('delhi') || domain.includes('edudel')) {
        schoolName = 'Delhi';
    } else if (domain.includes('kgbv')) {
        schoolName = 'KGBV';
    } else if (domain.includes('gujarat')) {
        schoolName = 'Gujarat';
    } else if (domain.includes('uk.gov') || domain.includes('uttarakhand')) {
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
        // Fallback clean extraction
        // Strip common TLDs: .gov.in, .nic.in, .edu.in, .ac.in, .org.in, .co.in, .com, .edu, .org, .net, etc.
        let cleaned = domain
            .replace(/\.(gov|nic|edu|ac|org|co|res)\.in$/i, '')
            .replace(/\.(in|com|org|net|edu|gov|io|ai)$/i, '');
        // Take the main subdomain or domain name
        const parts = cleaned.split('.').filter(p => p.length > 0);
        const mainPart = parts.length > 0 ? parts[parts.length - 1] : cleaned;
        // Convert hyphens/underscores to spaces and capitalize
        schoolName = mainPart
            .split(/[-_]/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        if (!schoolName) schoolName = domain;
    }
    
    return {
        domain,
        extension,
        schoolName
    };
}

async function processCSVFiles(files, emailColConfig, actionColConfig, actionFilters) {
    let globalLog = [];
    function log(message, logLevel = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        globalLog.push({ timestamp, message, logLevel });
        self.postMessage({ type: 'LOG', timestamp, message, logLevel });
    }

    log(`Starting multi-school processing of ${files.length} file(s)...`, 'info');

    let totalRawRecords = 0;
    let totalMatchingActions = 0;
    let totalAdobeExcluded = 0;
    
    // Grouping by school extension: extension -> { schoolName, extension, emailsSet: Set() }
    const schoolGroups = new Map();
    // Master deduplication set across all schools
    const masterEmailSet = new Set();
    const masterEmailList = [];
    
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
        let isFirstChunk = true;
        let fileRawRecords = 0;

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
                    
                    emailColIdx = detectEmailColumn(headersList, emailColConfig);
                    actionColIdx = detectActionColumn(headersList, actionColConfig);

                    log(`Mapping email column to: ${emailColIdx !== -1 ? `Index ${emailColIdx} ("${headersList[emailColIdx]}")` : 'Index 3 (User Email)'}`, 'info');
                    log(`Mapping action column to: ${actionColIdx !== -1 ? `Index ${actionColIdx} ("${headersList[actionColIdx]}")` : 'Auto scan'}`, 'info');
                    
                    headersDetected = true;
                    startIdx = 1;
                }
                isFirstChunk = false;
            } else if (isFirstChunk && fileIdx > 0) {
                startIdx = 1; // Skip header line for subsequent files
                isFirstChunk = false;
            }

            for (let i = startIdx; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                fileRawRecords++;
                totalRawRecords++;
                
                const fields = parseCSVLine(line);
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
                            const schoolInfo = extractSchoolInfoFromEmail(lowerEmail);
                            
                            if (schoolInfo) {
                                if (!schoolGroups.has(schoolInfo.extension)) {
                                    schoolGroups.set(schoolInfo.extension, {
                                        schoolName: schoolInfo.schoolName,
                                        extension: schoolInfo.extension,
                                        emailsSet: new Set()
                                    });
                                }
                                schoolGroups.get(schoolInfo.extension).emailsSet.add(lowerEmail);
                            }
                            
                            if (!masterEmailSet.has(lowerEmail)) {
                                masterEmailSet.add(lowerEmail);
                                masterEmailList.push({
                                    email: lowerEmail,
                                    schoolName: schoolInfo ? schoolInfo.schoolName : 'Unknown',
                                    extension: schoolInfo ? schoolInfo.extension : ''
                                });
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
                cleanEmails: masterEmailSet.size,
                schoolsDetected: schoolGroups.size
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
                        const schoolInfo = extractSchoolInfoFromEmail(lowerEmail);
                        
                        if (schoolInfo) {
                            if (!schoolGroups.has(schoolInfo.extension)) {
                                schoolGroups.set(schoolInfo.extension, {
                                    schoolName: schoolInfo.schoolName,
                                    extension: schoolInfo.extension,
                                    emailsSet: new Set()
                                });
                            }
                            schoolGroups.get(schoolInfo.extension).emailsSet.add(lowerEmail);
                        }
                        
                        if (!masterEmailSet.has(lowerEmail)) {
                            masterEmailSet.add(lowerEmail);
                            masterEmailList.push({
                                email: lowerEmail,
                                schoolName: schoolInfo ? schoolInfo.schoolName : 'Unknown',
                                extension: schoolInfo ? schoolInfo.extension : ''
                            });
                        }
                    }
                }
            }
        }

        log(`Finished file "${file.name}". Current unique email pool: ${masterEmailSet.size} across ${schoolGroups.size} school extension(s).`, 'success');
    }

    log(`All files parsed. Compiling per-school breakdown and unique email records...`, 'info');

    // Build schools list
    const schoolsList = [];
    for (const [extension, group] of schoolGroups.entries()) {
        const emailsArr = Array.from(group.emailsSet);
        
        // Build clean CSV string for this school
        let schoolCsv = "User Email\n";
        for (const em of emailsArr) {
            const escaped = em.includes(',') ? `"${em}"` : em;
            schoolCsv += `${escaped}\n`;
        }

        schoolsList.push({
            schoolName: group.schoolName,
            extension: group.extension,
            uniqueCount: emailsArr.length,
            csvContent: schoolCsv,
            sampleEmails: emailsArr.slice(0, 10)
        });
    }

    // Sort schools alphabetically
    schoolsList.sort((a, b) => a.schoolName.localeCompare(b.schoolName));

    log(`Extraction complete: Detected ${schoolsList.length} school(s) with ${masterEmailSet.size} total unique emails.`, 'success');
    for (const sch of schoolsList) {
        log(`  • ${sch.schoolName} (${sch.extension}): ${sch.uniqueCount.toLocaleString()} unique emails`, 'info');
    }

    // Build Master Combined CSV
    let masterCsv = "User Email,School Name,Extension\n";
    for (const rec of masterEmailList) {
        const escapedEmail = rec.email.includes(',') ? `"${rec.email}"` : rec.email;
        const escapedSchool = rec.schoolName.includes(',') ? `"${rec.schoolName}"` : rec.schoolName;
        masterCsv += `${escapedEmail},${escapedSchool},${rec.extension}\n`;
    }

    return {
        schoolsList,
        masterCsvContent: masterCsv,
        stats: {
            totalRawRecords,
            totalMatchingActions,
            totalAdobeExcluded,
            finalCleanCount: masterEmailSet.size,
            schoolsCount: schoolsList.length,
            filesProcessed: files.length
        },
        previewRows: masterEmailList.slice(0, 100),
        logs: globalLog
    };
}

function detectEmailColumn(headers, configValue) {
    if (configValue !== 'auto') {
        const idx = headers.indexOf(configValue);
        if (idx !== -1) return idx;
        const idxNum = parseInt(configValue);
        if (!isNaN(idxNum) && idxNum >= 0 && idxNum < headers.length) return idxNum;
    }
    
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i].toLowerCase().trim();
        if (header === 'user email' || header === 'email' || header === 'user_email') {
            return i;
        }
    }
    
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i].toLowerCase();
        if (header.includes('email') || header.includes('mail')) {
            return i;
        }
    }

    return 3; // Default to Column D (index 3)
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

    return -1;
}
