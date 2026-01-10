const fs = require('fs');
const path = require('path');

// Chemin du fichier communes.generated.json
const communesFilePath = path.join(__dirname, '..', 'front', 'src', 'utils', 'communes.generated.json');

// Lire le fichier existant
console.log('Reading communes file...');
const communesData = JSON.parse(fs.readFileSync(communesFilePath, 'utf-8'));

// Les nouvelles communes avec leurs wilayas associées
const newCommunesWithWilaya = [
    // Wilaya 49 - Timimoun
    { fr: "Timimoun", ar: "تيميمون", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Tinerkouk", ar: "تنركوك", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Ouled Said", ar: "أولاد السعيد", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Metarfa", ar: "المطارفة", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Talmine", ar: "طالمين", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Ouled Aissa", ar: "أولاد عيسى", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Charouine", ar: "شروين", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Aougrout", ar: "أوقروت", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Deldoul", ar: "دلدول", wilayaFr: "timimoun", wilayaAr: "تيميمون" },
    { fr: "Ksar Kaddour", ar: "قصر قدور", wilayaFr: "timimoun", wilayaAr: "تيميمون" },

    // Wilaya 50 - Bordj Badji Mokhtar
    { fr: "Bordj Badji Mokhtar", ar: "برج باجي مختار", wilayaFr: "bordj badji mokhtar", wilayaAr: "برج باجي مختار" },
    { fr: "Timiaouine", ar: "تيمياوين", wilayaFr: "bordj badji mokhtar", wilayaAr: "برج باجي مختار" },

    // Wilaya 51 - Ouled Djellal
    { fr: "Ouled Djellal", ar: "أولاد جلال", wilayaFr: "ouled djellal", wilayaAr: "أولاد جلال" },
    { fr: "Ras El Miad", ar: "رأس الميعاد", wilayaFr: "ouled djellal", wilayaAr: "أولاد جلال" },
    { fr: "Besbes", ar: "بسباس", wilayaFr: "ouled djellal", wilayaAr: "أولاد جلال" },
    { fr: "Sidi Khaled", ar: "سيدي خالد", wilayaFr: "ouled djellal", wilayaAr: "أولاد جلال" },
    { fr: "Doucen", ar: "الدوسن", wilayaFr: "ouled djellal", wilayaAr: "أولاد جلال" },
    { fr: "Chaiba", ar: "الشعيبة", wilayaFr: "ouled djellal", wilayaAr: "أولاد جلال" },

    // Wilaya 52 - Beni Abbes
    { fr: "Beni Abbes", ar: "بني عباس", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },
    { fr: "Tamtert", ar: "تامترت", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },
    { fr: "Igli", ar: "إقلي", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },
    { fr: "El Ouata", ar: "الواتة", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },
    { fr: "Ouled Khodeir", ar: "أولاد خضير", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },
    { fr: "Kerzaz", ar: "كرزاز", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },
    { fr: "Timoudi", ar: "تيمودي", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },
    { fr: "Ksabi", ar: "القصابي", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },
    { fr: "Beni Ikhlef", ar: "بن يخلف", wilayaFr: "beni abbes", wilayaAr: "بني عباس" },

    // Wilaya 53 - In Salah
    { fr: "In Salah", ar: "عين صالح", wilayaFr: "in salah", wilayaAr: "عين صالح" },
    { fr: "In Ghar", ar: "إينغر", wilayaFr: "in salah", wilayaAr: "عين صالح" },
    { fr: "Foggaret Ezzoua", ar: "فقارة الزوى", wilayaFr: "in salah", wilayaAr: "عين صالح" },

    // Wilaya 54 - In Guezzam
    { fr: "In Guezzam", ar: "عين قزام", wilayaFr: "in guezzam", wilayaAr: "عين قزام" },
    { fr: "Tin Zouatine", ar: "تين زواتين", wilayaFr: "in guezzam", wilayaAr: "عين قزام" },

    // Wilaya 55 - Touggourt
    { fr: "Touggourt", ar: "تقرت", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Temacine", ar: "تماسين", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Sidi Slimane", ar: "سيدي سليمان", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Megarine", ar: "المقارين", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Nezla", ar: "النزلة", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Blidet Amor", ar: "بلدة اعمر", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Tebesbest", ar: "تبسبست", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Taibet", ar: "الطيبات", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "El Alia", ar: "العالية", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "El Hadjira", ar: "الحجيرة", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Benaceur", ar: "بن ناصر", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "M'naguer", ar: "المنقر", wilayaFr: "touggourt", wilayaAr: "تقرت" },
    { fr: "Zaouia El Abidia", ar: "الزاوية العابدية", wilayaFr: "touggourt", wilayaAr: "تقرت" },

    // Wilaya 56 - Djanet
    { fr: "Djanet", ar: "جانت", wilayaFr: "djanet", wilayaAr: "جانت" },
    { fr: "Bordj El Haouass", ar: "برج الحواس", wilayaFr: "djanet", wilayaAr: "جانت" },

    // Wilaya 57 - El M'Ghair
    { fr: "El M'ghair", ar: "المغير", wilayaFr: "el mghair", wilayaAr: "المغير" },
    { fr: "Oum Touyour", ar: "أم الطيور", wilayaFr: "el mghair", wilayaAr: "المغير" },
    { fr: "Sidi Amrane", ar: "سيدي عمران", wilayaFr: "el mghair", wilayaAr: "المغير" },
    { fr: "M'rara", ar: "المرارة", wilayaFr: "el mghair", wilayaAr: "المغير" },
    { fr: "Djamaa", ar: "جامعة", wilayaFr: "el mghair", wilayaAr: "المغير" },
    { fr: "Tenedla", ar: "تندلة", wilayaFr: "el mghair", wilayaAr: "المغير" },
    { fr: "Still", ar: "سطيل", wilayaFr: "el mghair", wilayaAr: "المغير" },
    { fr: "Sidi Khelil", ar: "سيدي خليل", wilayaFr: "el mghair", wilayaAr: "المغير" },

    // Wilaya 58 - El Meniaa
    { fr: "El Meniaa", ar: "المنيعة", wilayaFr: "el meniaa", wilayaAr: "المنيعة" },
    { fr: "Hassi Gara", ar: "حاسي القارة", wilayaFr: "el meniaa", wilayaAr: "المنيعة" },
    { fr: "Hassi Fehal", ar: "حاسي الفحل", wilayaFr: "el meniaa", wilayaAr: "المنيعة" },
];

// Fonction pour normaliser un nom
const normalizeKey = (name) => {
    return name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

// Liste des clés à supprimer (les anciennes entrées mal formatées)
const keysToRemove = [
    "timimoun", "tinerkouk", "ouled said", "metarfa", "talmine", "ouled aissa",
    "charouine", "aougrout", "deldoul", "ksar kaddour", "bordj badji mokhtar",
    "timiaouine", "ouled djellal", "ras el miad", "besbes", "sidi khaled",
    "doucen", "chaiba", "beni abbes", "tamtert", "igli", "el ouata",
    "ouled khodeir", "kerzaz", "timoudi", "ksabi", "beni ikhlef",
    "in salah", "in ghar", "foggaret ezzoua", "in guezzam", "tin zouatine",
    "touggourt", "temacine", "sidi slimane", "megarine", "nezla",
    "blidet amor", "tebesbest", "taibet", "el alia", "el hadjira",
    "benaceur", "mnaguer", "zaouia el abidia", "djanet", "bordj el haouass",
    "el mghair", "oum touyour", "sidi amrane", "mrara", "djamaa",
    "tenedla", "still", "sidi khelil", "el meniaa", "hassi gara", "hassi fehal"
];

// Traiter chaque section
const sections = ['arToFr', 'byArWithWilaya', 'byFrWithWilaya', 'frToFr'];

sections.forEach(section => {
    if (!communesData[section]) {
        console.log(`Section ${section} not found, skipping...`);
        return;
    }

    console.log(`Processing section: ${section}`);

    // Supprimer les anciennes entrées mal formatées
    keysToRemove.forEach(key => {
        if (communesData[section][key]) {
            delete communesData[section][key];
            console.log(`  Deleted old key: ${key}`);
        }
    });

    // Ajouter les nouvelles entrées au bon format
    newCommunesWithWilaya.forEach(commune => {
        if (section === 'arToFr') {
            // Format: "communeAr": "CommuneFr"
            if (!communesData[section][commune.ar]) {
                communesData[section][commune.ar] = commune.fr;
                console.log(`  Added to arToFr: ${commune.ar} -> ${commune.fr}`);
            }
        } else if (section === 'byArWithWilaya') {
            // Format: "communeAr||wilayaAr": "CommuneFr"
            const key = `${commune.ar}||${commune.wilayaAr}`;
            if (!communesData[section][key]) {
                communesData[section][key] = commune.fr;
                console.log(`  Added to byArWithWilaya: ${key} -> ${commune.fr}`);
            }
        } else if (section === 'byFrWithWilaya') {
            // Format: "communefr||wilayafr": "CommuneFr"
            const normalizedCommune = normalizeKey(commune.fr);
            const key = `${normalizedCommune}||${commune.wilayaFr}`;
            if (!communesData[section][key]) {
                communesData[section][key] = commune.fr;
                console.log(`  Added to byFrWithWilaya: ${key} -> ${commune.fr}`);
            }
        } else if (section === 'frToFr') {
            // Format: "communefr": "CommuneFr"
            const normalizedCommune = normalizeKey(commune.fr);
            if (!communesData[section][normalizedCommune]) {
                communesData[section][normalizedCommune] = commune.fr;
                console.log(`  Added to frToFr: ${normalizedCommune} -> ${commune.fr}`);
            }
        }
    });
});

// Écrire le fichier mis à jour
console.log('\nWriting updated communes file...');
fs.writeFileSync(communesFilePath, JSON.stringify(communesData, null, 2), 'utf-8');

console.log('Done!');
