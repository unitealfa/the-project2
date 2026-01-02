const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../front/src/utils/communes.generated.json');
const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

// Fix Nador (Tipaza)
// It was listed as code 42015 "Nodor" with wrong Arabic name
if (data.byCode['42015'] && data.byCode['42015'].fr === 'Nodor') {
    // Create correct entry at 42011 (official code) or keep 42015 but fix names?
    // Let's create a clean entry for Nador at 42015 to match the existing key,
    // but importantly fix names so lookup works.

    data.byCode['42015'].fr = 'Nador';
    data.byCode['42015'].ar = 'الناظور';

    console.log('Patched 42015: Nodor -> Nador');
} else {
    // If not found at 42015, check 42011 or create it
    if (!data.byCode['42011']) {
        data.byCode['42011'] = {
            codeC: "42011",
            fr: "Nador",
            ar: "الناظور",
            wilayaCode: "42",
            wilayaAr: "تيبازة",
            wilayaFr: "Tipaza"
        };
        console.log('Created missing Nador entry at 42011');
    }
}

// Write back
fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
console.log('Saved changes.');
