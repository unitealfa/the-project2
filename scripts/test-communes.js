/**
 * Test script to verify all commune/wilaya mappings work correctly
 * Run with: node scripts/test-communes.js
 */

const fs = require('fs');
const path = require('path');

// Load the communes data
const communesPath = path.join(__dirname, '../front/src/utils/communes.generated.json');
const communesData = JSON.parse(fs.readFileSync(communesPath, 'utf8'));

// Normalize function (same as in communes.ts)
function normalize(text) {
    if (!text) return '';
    return String(text)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f\u064b-\u065f\u0640]/g, '')
        .replace(/[ءآأإ]/g, 'ا')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/['"`]/g, '')
        .replace(/[\-_.]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

// getWilayaIdByCommune function (same as in communes.ts)
function getWilayaIdByCommune(communeName) {
    if (!communeName) return 16;
    const n = normalize(communeName);
    if (!n) return 16;

    for (const [, entry] of Object.entries(communesData.byCode)) {
        const e = entry;
        if (normalize(e.fr) === n || normalize(e.ar) === n) {
            const codeC = String(e.codeC || '');
            if (codeC.length >= 2) {
                const wilayaId = parseInt(codeC.substring(0, 2), 10);
                if (!isNaN(wilayaId) && wilayaId >= 1 && wilayaId <= 58) {
                    return wilayaId;
                }
            }
            if (e.wilayaCode) {
                const wc = parseInt(String(e.wilayaCode), 10);
                if (!isNaN(wc) && wc >= 1 && wc <= 58) {
                    return wc;
                }
            }
        }
    }

    return 16;
}

// Run tests
console.log('='.repeat(60));
console.log('TEST UNITAIRE - COMMUNES ET WILAYAS');
console.log('='.repeat(60));

let totalCommunes = 0;
let passedFr = 0;
let passedAr = 0;
let failedFr = [];
let failedAr = [];
let wilayaStats = {};

// Test each commune
for (const [code, entry] of Object.entries(communesData.byCode)) {
    totalCommunes++;
    const expectedWilaya = parseInt(entry.wilayaCode);

    // Test French name
    const resultFr = getWilayaIdByCommune(entry.fr);
    if (resultFr === expectedWilaya) {
        passedFr++;
    } else {
        failedFr.push({
            commune: entry.fr,
            expected: expectedWilaya,
            got: resultFr,
            wilayaName: entry.wilayaFr
        });
    }

    // Test Arabic name
    const resultAr = getWilayaIdByCommune(entry.ar);
    if (resultAr === expectedWilaya) {
        passedAr++;
    } else {
        failedAr.push({
            commune: entry.ar,
            expected: expectedWilaya,
            got: resultAr,
            wilayaName: entry.wilayaAr
        });
    }

    // Track wilaya stats
    if (!wilayaStats[expectedWilaya]) {
        wilayaStats[expectedWilaya] = {
            name: entry.wilayaFr,
            count: 0
        };
    }
    wilayaStats[expectedWilaya].count++;
}

// Print results
console.log('\n📊 RÉSUMÉ:');
console.log(`   Total communes: ${totalCommunes}`);
console.log(`   Tests français:  ${passedFr}/${totalCommunes} (${((passedFr / totalCommunes) * 100).toFixed(1)}%)`);
console.log(`   Tests arabe:     ${passedAr}/${totalCommunes} (${((passedAr / totalCommunes) * 100).toFixed(1)}%)`);

console.log('\n🗺️  WILAYAS TESTÉES:');
const sortedWilayas = Object.keys(wilayaStats).sort((a, b) => parseInt(a) - parseInt(b));
for (const wid of sortedWilayas) {
    console.log(`   ${wid.padStart(2, ' ')}. ${wilayaStats[wid].name.padEnd(20)} - ${wilayaStats[wid].count} communes`);
}

if (failedFr.length > 0) {
    console.log('\n❌ ÉCHECS (noms français):');
    failedFr.slice(0, 10).forEach(f => {
        console.log(`   "${f.commune}" (${f.wilayaName}): attendu ${f.expected}, obtenu ${f.got}`);
    });
    if (failedFr.length > 10) {
        console.log(`   ... et ${failedFr.length - 10} autres`);
    }
}

if (failedAr.length > 0) {
    console.log('\n❌ ÉCHECS (noms arabe):');
    failedAr.slice(0, 10).forEach(f => {
        console.log(`   "${f.commune}" (${f.wilayaName}): attendu ${f.expected}, obtenu ${f.got}`);
    });
    if (failedAr.length > 10) {
        console.log(`   ... et ${failedAr.length - 10} autres`);
    }
}

// Test specific known cases
console.log('\n🧪 TESTS SPÉCIFIQUES:');
const specificTests = [
    { name: 'Annaba', expected: 23 },
    { name: 'عنابة', expected: 23 },
    { name: 'Sétif', expected: 19 },
    { name: 'Setif', expected: 19 },
    { name: 'سطيف', expected: 19 },
    { name: 'Alger Centre', expected: 16 },
    { name: 'الجزائر الوسطى', expected: 16 },
    { name: 'Oran', expected: 31 },
    { name: 'وهران', expected: 31 },
    { name: 'Constantine', expected: 25 },
    { name: 'قسنطينة', expected: 25 },
    { name: 'Blida', expected: 9 },
    { name: 'البليدة', expected: 9 },
    { name: 'Tizi Ouzou', expected: 15 },
    { name: 'تيزي وزو', expected: 15 },
    { name: 'Béjaïa', expected: 6 },
    { name: 'Bejaia', expected: 6 },
    { name: 'بجاية', expected: 6 },
];

let specificPassed = 0;
for (const test of specificTests) {
    const result = getWilayaIdByCommune(test.name);
    const status = result === test.expected ? '✅' : '❌';
    console.log(`   ${status} "${test.name}" → wilaya ${result} (attendu: ${test.expected})`);
    if (result === test.expected) specificPassed++;
}

console.log('\n' + '='.repeat(60));
if (failedFr.length === 0 && failedAr.length === 0 && specificPassed === specificTests.length) {
    console.log('✅ TOUS LES TESTS SONT PASSÉS!');
} else {
    console.log(`⚠️  ${failedFr.length + failedAr.length} tests échoués sur ${totalCommunes * 2}`);
    console.log(`   Tests spécifiques: ${specificPassed}/${specificTests.length}`);
}
console.log('='.repeat(60));
