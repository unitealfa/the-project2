const fs = require('fs');
const path = require('path');

const frPath2 = path.resolve(__dirname, '..', 'communes fr json.json');
const arPath = path.resolve(__dirname, '..', 'commune arabe json.json');

function run() {
    const frList = JSON.parse(fs.readFileSync(frPath2, 'utf8')).filter(c => parseInt(c.wilaya_id, 10) === 16);
    const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
    const arList = (arData.communes || []).filter(c => parseInt(c.codeW, 10) === 16);

    const arMap = {};
    arList.forEach(c => {
        arMap[c.codeC] = c.baladiya;
    });

    const results = frList.sort((a, b) => a.code_postal.localeCompare(b.code_postal)).map(f => {
        const cpVal = parseInt(f.code_postal, 10);
        const expectedArCode = String((Math.floor(cpVal / 1000) * 100) + (cpVal % 1000)).padStart(4, '0');
        const nameAtExpected = arMap[expectedArCode] || 'MISSING';

        return {
            frCode: f.code_postal,
            frName: f.nom,
            arCodeExpected: expectedArCode,
            arNameAtExpected: nameAtExpected
        };
    });

    fs.writeFileSync(path.resolve(__dirname, '..', 'algiers_audit.json'), JSON.stringify(results, null, 2), 'utf8');
    console.log('Audit results written to algiers_audit.json');
}

run();
