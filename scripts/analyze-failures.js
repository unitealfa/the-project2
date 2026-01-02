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

    if (wilayaHint) {
        const hintStr = String(wilayaHint).trim();
        const hintCode = parseInt(hintStr, 10);

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

console.log('=== ANALYSE DES ECHECS RESTANTS ===\n');

const failures = [];
for (const [code, e] of Object.entries(data.byCode)) {
    const expectedW = parseInt(e.wilayaCode);

    const resultFr = getWilayaIdByCommune(e.fr, expectedW);
    if (resultFr !== expectedW) {
        failures.push({
            type: 'FR',
            code: code,
            name: e.fr,
            nameLength: e.fr ? e.fr.length : 0,
            normalized: normalize(e.fr),
            expected: expectedW,
            got: resultFr,
            wilaya: e.wilayaFr,
            codeC: e.codeC
        });
    }

    const resultAr = getWilayaIdByCommune(e.ar, expectedW);
    if (resultAr !== expectedW) {
        failures.push({
            type: 'AR',
            code: code,
            name: e.ar,
            nameLength: e.ar ? e.ar.length : 0,
            normalized: normalize(e.ar),
            expected: expectedW,
            got: resultAr,
            wilaya: e.wilayaAr,
            codeC: e.codeC
        });
    }
}

console.log('Total echecs: ' + failures.length + '\n');

failures.forEach((f, i) => {
    console.log((i + 1) + '. ' + f.type + ' code:' + f.code);
    console.log('   name="' + f.name + '" (len:' + f.nameLength + ')');
    console.log('   normalized="' + f.normalized + '"');
    console.log('   codeC=' + f.codeC + ' wilaya=' + f.wilaya);
    console.log('   expected:' + f.expected + ' got:' + f.got);
    console.log('');
});
