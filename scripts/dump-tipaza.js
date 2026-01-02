const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./front/src/utils/communes.generated.json', 'utf8'));

const entries = Object.entries(data.byCode)
    .filter(([, e]) => e.wilayaCode === '42')
    .map(([, e]) => `${e.codeC}: ${e.fr} / ${e.ar} (Wilaya: ${e.wilayaFr})`)
    .sort();

fs.writeFileSync('tipaza_dump.txt', entries.join('\n'));
