const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./front/src/utils/communes.generated.json', 'utf8'));

const entries = Object.entries(data.byCode)
    .filter(([, e]) => e.wilayaCode === '42')
    .map(([, e]) => ({
        code: e.codeC,
        fr: e.fr,
        ar: e.ar
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

console.log(JSON.stringify(entries, null, 2));
