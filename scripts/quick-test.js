const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./front/src/utils/communes.generated.json', 'utf8'));

function normalize(t) {
    if (!t) return '';
    return String(t).normalize('NFKD')
        .replace(/[\u0300-\u036f\u064b-\u065f\u0640]/g, '')
        .replace(/[ءآأإ]/g, 'ا').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه').replace(/ى/g, 'ي')
        .replace(/['`"]/g, '').replace(/[\-_.]/g, ' ').replace(/\s+/g, ' ')
        .trim().toLowerCase();
}

function getWilayaIdByCommune(communeName, wilayaHint) {
    if (!communeName) return 16;
    const n = normalize(communeName);
    if (!n) return 16;

    // If we have a wilaya hint (code or name), try to use it for disambiguation
    if (wilayaHint) {
        const hintStr = String(wilayaHint).trim();
        const hintCode = parseInt(hintStr, 10);

        // If hint is a valid wilaya code (1-58), search with that prefix
        if (!isNaN(hintCode) && hintCode >= 1 && hintCode <= 58) {
            const codePrefix = String(hintCode).padStart(2, '0');
            for (const [, entry] of Object.entries(data.byCode)) {
                const e = entry;
                if (String(e.codeC).startsWith(codePrefix)) {
                    if (normalize(e.fr) === n || normalize(e.ar) === n) {
                        return hintCode;
                    }
                }
            }
        }
    }

    // Search through byCode entries to find matching commune
    const matches = [];
    for (const [, entry] of Object.entries(data.byCode)) {
        const e = entry;
        if (normalize(e.fr) === n || normalize(e.ar) === n) {
            const codeC = String(e.codeC || '');
            if (codeC.length >= 2) {
                const wilayaId = parseInt(codeC.substring(0, 2), 10);
                if (!isNaN(wilayaId) && wilayaId >= 1 && wilayaId <= 58) {
                    matches.push(wilayaId);
                }
            } else if (e.wilayaCode) {
                const wc = parseInt(String(e.wilayaCode), 10);
                if (!isNaN(wc) && wc >= 1 && wc <= 58) {
                    matches.push(wc);
                }
            }
        }
    }

    if (matches.length === 1) return matches[0];

    if (matches.length > 1 && wilayaHint) {
        const hintCode = parseInt(String(wilayaHint), 10);
        if (!isNaN(hintCode) && matches.includes(hintCode)) {
            return hintCode;
        }
    }

    if (matches.length > 0) return matches[0];
    return 16;
}

console.log('=== TEST AVEC WILAYA HINT ===\n');

// Full test with wilayaHint
let totalOk = 0;
let totalFail = 0;
const failures = [];
for (const [code, e] of Object.entries(data.byCode)) {
    const expectedW = parseInt(e.wilayaCode);

    // Test FR with hint
    const resultFr = getWilayaIdByCommune(e.fr, expectedW);
    if (resultFr === expectedW) { totalOk++; } else {
        totalFail++;
        if (failures.length < 20) failures.push({ type: 'FR', name: e.fr, expected: expectedW, got: resultFr, wilaya: e.wilayaFr });
    }

    // Test AR with hint
    const resultAr = getWilayaIdByCommune(e.ar, expectedW);
    if (resultAr === expectedW) { totalOk++; } else {
        totalFail++;
        if (failures.length < 20) failures.push({ type: 'AR', name: e.ar, expected: expectedW, got: resultAr, wilaya: e.wilayaAr });
    }
}

console.log('Test complet (FR + AR) avec hint: ' + totalOk + '/' + (totalOk + totalFail) + ' OK');
console.log('Echecs: ' + totalFail);

if (failures.length > 0) {
    console.log('\nExemples d echecs:');
    failures.forEach(f => {
        console.log('  ' + f.type + ' "' + f.name + '" (' + f.wilaya + '): attendu ' + f.expected + ', obtenu ' + f.got);
    });
}

console.log('\n' + (totalFail === 0 ? '=== TOUS LES TESTS PASSENT ===' : '=== ' + totalFail + ' ECHECS ==='));
