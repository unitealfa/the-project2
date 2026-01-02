const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./front/src/utils/communes.generated.json', 'utf8'));

console.log('=== COMMUNES AVEC NOMS ARABES VIDES ===\n');

const emptyAr = [];
for (const [code, e] of Object.entries(data.byCode)) {
    if (!e.ar || e.ar.trim() === '') {
        emptyAr.push({
            code: code,
            fr: e.fr,
            ar: e.ar,
            wilayaCode: e.wilayaCode,
            wilayaFr: e.wilayaFr
        });
    }
}

console.log('Total: ' + emptyAr.length + '\n');

emptyAr.forEach(e => {
    console.log(e.code + ': "' + e.fr + '" (wilaya ' + e.wilayaCode + ' - ' + e.wilayaFr + ')');
});
