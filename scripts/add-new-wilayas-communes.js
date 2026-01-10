const fs = require('fs');
const path = require('path');

// Nouvelles communes des 10 nouvelles wilayas (49-58)
const newCommunes = [
    // Wilaya 49 - Timimoun
    { code: "49001", fr: "Timimoun", ar: "تيميمون", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49002", fr: "Tinerkouk", ar: "تنركوك", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49003", fr: "Ouled Said", ar: "أولاد السعيد", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49004", fr: "Metarfa", ar: "المطارفة", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49005", fr: "Talmine", ar: "طالمين", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49006", fr: "Ouled Aissa", ar: "أولاد عيسى", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49007", fr: "Charouine", ar: "شروين", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49008", fr: "Aougrout", ar: "أوقروت", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49009", fr: "Deldoul", ar: "دلدول", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },
    { code: "49010", fr: "Ksar Kaddour", ar: "قصر قدور", wilayaCode: "49", wilayaAr: "تيميمون", wilayaFr: "Timimoun" },

    // Wilaya 50 - Bordj Badji Mokhtar
    { code: "50001", fr: "Bordj Badji Mokhtar", ar: "برج باجي مختار", wilayaCode: "50", wilayaAr: "برج باجي مختار", wilayaFr: "Bordj Badji Mokhtar" },
    { code: "50002", fr: "Timiaouine", ar: "تيمياوين", wilayaCode: "50", wilayaAr: "برج باجي مختار", wilayaFr: "Bordj Badji Mokhtar" },

    // Wilaya 51 - Ouled Djellal
    { code: "51001", fr: "Ouled Djellal", ar: "أولاد جلال", wilayaCode: "51", wilayaAr: "أولاد جلال", wilayaFr: "Ouled Djellal" },
    { code: "51002", fr: "Ras El Miad", ar: "رأس الميعاد", wilayaCode: "51", wilayaAr: "أولاد جلال", wilayaFr: "Ouled Djellal" },
    { code: "51003", fr: "Besbes", ar: "بسباس", wilayaCode: "51", wilayaAr: "أولاد جلال", wilayaFr: "Ouled Djellal" },
    { code: "51004", fr: "Sidi Khaled", ar: "سيدي خالد", wilayaCode: "51", wilayaAr: "أولاد جلال", wilayaFr: "Ouled Djellal" },
    { code: "51005", fr: "Doucen", ar: "الدوسن", wilayaCode: "51", wilayaAr: "أولاد جلال", wilayaFr: "Ouled Djellal" },
    { code: "51006", fr: "Chaiba", ar: "الشعيبة", wilayaCode: "51", wilayaAr: "أولاد جلال", wilayaFr: "Ouled Djellal" },

    // Wilaya 52 - Beni Abbes
    { code: "52001", fr: "Beni Abbes", ar: "بني عباس", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },
    { code: "52002", fr: "Tamtert", ar: "تامترت", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },
    { code: "52003", fr: "Igli", ar: "إقلي", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },
    { code: "52004", fr: "El Ouata", ar: "الواتة", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },
    { code: "52005", fr: "Ouled Khodeir", ar: "أولاد خضير", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },
    { code: "52006", fr: "Kerzaz", ar: "كرزاز", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },
    { code: "52007", fr: "Timoudi", ar: "تيمودي", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },
    { code: "52008", fr: "Ksabi", ar: "القصابي", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },
    { code: "52009", fr: "Beni Ikhlef", ar: "بن يخلف", wilayaCode: "52", wilayaAr: "بني عباس", wilayaFr: "Béni Abbès" },

    // Wilaya 53 - In Salah
    { code: "53001", fr: "In Salah", ar: "عين صالح", wilayaCode: "53", wilayaAr: "عين صالح", wilayaFr: "In Salah" },
    { code: "53002", fr: "In Ghar", ar: "إينغر", wilayaCode: "53", wilayaAr: "عين صالح", wilayaFr: "In Salah" },
    { code: "53003", fr: "Foggaret Ezzoua", ar: "فقارة الزوى", wilayaCode: "53", wilayaAr: "عين صالح", wilayaFr: "In Salah" },

    // Wilaya 54 - In Guezzam
    { code: "54001", fr: "In Guezzam", ar: "عين قزام", wilayaCode: "54", wilayaAr: "عين قزام", wilayaFr: "In Guezzam" },
    { code: "54002", fr: "Tin Zouatine", ar: "تين زواتين", wilayaCode: "54", wilayaAr: "عين قزام", wilayaFr: "In Guezzam" },

    // Wilaya 55 - Touggourt
    { code: "55001", fr: "Touggourt", ar: "تقرت", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55002", fr: "Temacine", ar: "تماسين", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55003", fr: "Sidi Slimane", ar: "سيدي سليمان", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55004", fr: "Megarine", ar: "المقارين", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55005", fr: "Nezla", ar: "النزلة", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55006", fr: "Blidet Amor", ar: "بلدة اعمر", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55007", fr: "Tebesbest", ar: "تبسبست", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55008", fr: "Taibet", ar: "الطيبات", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55009", fr: "El Alia", ar: "العالية", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55010", fr: "El Hadjira", ar: "الحجيرة", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55011", fr: "Benaceur", ar: "بن ناصر", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55012", fr: "M'naguer", ar: "المنقر", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },
    { code: "55013", fr: "Zaouia El Abidia", ar: "الزاوية العابدية", wilayaCode: "55", wilayaAr: "تقرت", wilayaFr: "Touggourt" },

    // Wilaya 56 - Djanet
    { code: "56001", fr: "Djanet", ar: "جانت", wilayaCode: "56", wilayaAr: "جانت", wilayaFr: "Djanet" },
    { code: "56002", fr: "Bordj El Haouass", ar: "برج الحواس", wilayaCode: "56", wilayaAr: "جانت", wilayaFr: "Djanet" },

    // Wilaya 57 - El M'Ghair
    { code: "57001", fr: "El M'ghair", ar: "المغير", wilayaCode: "57", wilayaAr: "المغير", wilayaFr: "El M'Ghair" },
    { code: "57002", fr: "Oum Touyour", ar: "أم الطيور", wilayaCode: "57", wilayaAr: "المغير", wilayaFr: "El M'Ghair" },
    { code: "57003", fr: "Sidi Amrane", ar: "سيدي عمران", wilayaCode: "57", wilayaAr: "المغير", wilayaFr: "El M'Ghair" },
    { code: "57004", fr: "M'rara", ar: "المرارة", wilayaCode: "57", wilayaAr: "المغير", wilayaFr: "El M'Ghair" },
    { code: "57005", fr: "Djamaa", ar: "جامعة", wilayaCode: "57", wilayaAr: "المغير", wilayaFr: "El M'Ghair" },
    { code: "57006", fr: "Tenedla", ar: "تندلة", wilayaCode: "57", wilayaAr: "المغير", wilayaFr: "El M'Ghair" },
    { code: "57007", fr: "Still", ar: "سطيل", wilayaCode: "57", wilayaAr: "المغير", wilayaFr: "El M'Ghair" },
    { code: "57008", fr: "Sidi Khelil", ar: "سيدي خليل", wilayaCode: "57", wilayaAr: "المغير", wilayaFr: "El M'Ghair" },

    // Wilaya 58 - El Meniaa
    { code: "58001", fr: "El Meniaa", ar: "المنيعة", wilayaCode: "58", wilayaAr: "المنيعة", wilayaFr: "El Meniaa" },
    { code: "58002", fr: "Hassi Gara", ar: "حاسي القارة", wilayaCode: "58", wilayaAr: "المنيعة", wilayaFr: "El Meniaa" },
    { code: "58003", fr: "Hassi Fehal", ar: "حاسي الفحل", wilayaCode: "58", wilayaAr: "المنيعة", wilayaFr: "El Meniaa" },
];

// Chemin du fichier communes.generated.json
const communesFilePath = path.join(__dirname, '..', 'front', 'src', 'utils', 'communes.generated.json');

// Lire le fichier existant
console.log('Reading communes file...');
const communesData = JSON.parse(fs.readFileSync(communesFilePath, 'utf-8'));

// Compteur pour afficher les statistiques
let addedByCode = 0;
let addedNormalized = 0;
let skippedByCode = 0;
let skippedNormalized = 0;

// Fonction pour normaliser un nom de commune (pour la section de mapping)
const normalizeCommune = (name) => {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

// Ajouter les communes à la section byCode
console.log('Adding communes to byCode section...');
newCommunes.forEach(commune => {
    if (communesData.byCode[commune.code]) {
        console.log(`  Skipping ${commune.code} (${commune.fr}) - already exists`);
        skippedByCode++;
    } else {
        communesData.byCode[commune.code] = {
            codeC: commune.code,
            fr: commune.fr,
            ar: commune.ar,
            wilayaCode: commune.wilayaCode,
            wilayaAr: commune.wilayaAr,
            wilayaFr: commune.wilayaFr
        };
        addedByCode++;
    }
});

// Trouver les clés de la section de mapping (après byCode)
// Cette section contient des clés normalisées vers les noms propres
console.log('Adding communes to normalized mapping section...');
const byCodeKeys = Object.keys(communesData.byCode);
const allKeys = Object.keys(communesData);

// La section de mapping est la deuxième clé du fichier root
const mappingKeys = allKeys.filter(key => key !== 'byCode');

// Ajouter les nouvelles communes au mapping normalisé
mappingKeys.forEach(mappingKey => {
    const mapping = communesData[mappingKey];
    if (typeof mapping === 'object' && mapping !== null) {
        newCommunes.forEach(commune => {
            const normalizedFr = normalizeCommune(commune.fr);
            const wilayaNormalized = normalizeCommune(commune.wilayaFr);
            const key = `${normalizedFr}||${wilayaNormalized}`;

            if (!mapping[normalizedFr] && !mapping[key]) {
                // Essayer d'ajouter avec la clé simple
                mapping[normalizedFr] = commune.fr;
                addedNormalized++;
            } else {
                skippedNormalized++;
            }
        });
    }
});

// Écrire le fichier mis à jour
console.log('Writing updated communes file...');
fs.writeFileSync(communesFilePath, JSON.stringify(communesData, null, 2), 'utf-8');

console.log('\n=== Summary ===');
console.log(`Added to byCode: ${addedByCode}`);
console.log(`Skipped in byCode: ${skippedByCode}`);
console.log(`Added to normalized mapping: ${addedNormalized}`);
console.log(`Skipped in normalized mapping: ${skippedNormalized}`);
console.log('\nDone!');
