const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../front/src/utils/communes.generated.json');
const data = JSON.parse(fs.readFileSync(targetPath, 'utf8'));

const translations = {
    // Boumerdès (35)
    "35033": "أولاد هداج",
    "35035": "لقاطة",
    "35036": "حمادي",
    "35037": "خميس الخشنة",
    "35038": "الخروبة",

    // Tipaza (42)
    "42030": "بو هارون",
    "42032": "سيدي غيلاس",
    "42033": "مسلمون",
    "42034": "سيدي راشد",
    "42035": "القليعة",
    "42036": "الحطاطبة",
    "42040": "سيدي سميان",
    "42041": "بني ميلك",
    "42042": "حجرة النص",

    // Blida (09)
    "09026": "بوقرة",
    "09027": "قرواو",
    "09028": "عين الرمانة",
    "09029": "جبابرة"
};

let patchedCount = 0;
for (const [code, arName] of Object.entries(translations)) {
    if (data.byCode[code]) {
        data.byCode[code].ar = arName;
        patchedCount++;
        console.log(`Patched ${code}: ${data.byCode[code].fr} -> ${arName}`);
    } else {
        console.error(`Code ${code} not found!`);
    }
}

fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
console.log(`\nSuccessfully patched ${patchedCount} communes.`);
