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

function getWilayaIdByCommune(c) {
    if (!c) return 16;
    const n = normalize(c);
    if (!n) return 16;
    for (const [, e] of Object.entries(data.byCode)) {
        if (normalize(e.fr) === n || normalize(e.ar) === n) {
            const codeC = String(e.codeC || '');
            if (codeC.length >= 2) {
                const w = parseInt(codeC.substring(0, 2), 10);
                if (!isNaN(w) && w >= 1 && w <= 58) return w;
            }
            if (e.wilayaCode) {
                const wc = parseInt(String(e.wilayaCode), 10);
                if (!isNaN(wc) && wc >= 1 && wc <= 58) return wc;
            }
        }
    }
    return 16;
}

console.log('=== COMMUNES QUI ECHOUENT ===\n');

let failures = [];
for (const [code, e] of Object.entries(data.byCode)) {
    const expectedW = parseInt(e.wilayaCode);
    const resultFr = getWilayaIdByCommune(e.fr);
    const resultAr = getWilayaIdByCommune(e.ar);

    if (resultFr !== expectedW) {
        failures.push({
            type: 'FR',
            name: e.fr,
            expected: expectedW,
            got: resultFr,
            wilayaFr: e.wilayaFr,
            code: code
        });
    }
    if (resultAr !== expectedW) {
        failures.push({
            type: 'AR',
            name: e.ar,
            expected: expectedW,
            got: resultAr,
            wilayaAr: e.wilayaAr,
            code: code
        });
    }
}

// Group by commune name (looking for duplicates)
const byName = {};
for (const [code, e] of Object.entries(data.byCode)) {
    const nFr = normalize(e.fr);
    const nAr = normalize(e.ar);
    if (!byName[nFr]) byName[nFr] = [];
    byName[nFr].push({ code, wilaya: e.wilayaCode, fr: e.fr });
    if (!byName[nAr]) byName[nAr] = [];
    byName[nAr].push({ code, wilaya: e.wilayaCode, ar: e.ar });
}

// Find duplicates (communes with same normalized name in different wilayas)
const duplicates = Object.entries(byName)
    .filter(([name, entries]) => {
        const wilayas = [...new Set(entries.map(e => e.wilaya))];
        return wilayas.length > 1;
    })
    .map(([name, entries]) => ({
        name,
        count: entries.length,
        wilayas: [...new Set(entries.map(e => e.wilaya))].join(', '),
        examples: entries.slice(0, 3)
    }));

console.log('Communes avec le meme nom dans plusieurs wilayas:', duplicates.length);
console.log('');

duplicates.slice(0, 20).forEach(d => {
    console.log('  "' + d.name + '" -> wilayas: ' + d.wilayas);
});

console.log('\n--- ECHECS DETAILS (premiers 30) ---\n');
failures.slice(0, 30).forEach(f => {
    console.log(f.type + ' "' + f.name + '" (' + (f.wilayaFr || f.wilayaAr) + ')');
    console.log('   attendu: ' + f.expected + ', obtenu: ' + f.got);
});

console.log('\nTotal echecs:', failures.length);
console.log('Dont FR:', failures.filter(f => f.type === 'FR').length);
console.log('Dont AR:', failures.filter(f => f.type === 'AR').length);
