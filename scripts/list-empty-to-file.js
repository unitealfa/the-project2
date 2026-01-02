const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync('./front/src/utils/communes.generated.json', 'utf8'));

const emptyAr = [];
for (const [code, e] of Object.entries(data.byCode)) {
    if (!e.ar || e.ar.trim() === '') {
        emptyAr.push({
            code: code,
            fr: e.fr,
            wilaya: e.wilayaFr
        });
    }
}

fs.writeFileSync('empty_communes.json', JSON.stringify(emptyAr, null, 2));
console.log('Saved ' + emptyAr.length + ' empty communes to empty_communes.json');
