const fs = require('fs');
const path = require('path');

const frPath1 = path.resolve(__dirname, '..', 'communes_fr.json');
const frPath2 = path.resolve(__dirname, '..', 'communes fr json.json');
const arPath = path.resolve(__dirname, '..', 'commune arabe json.json');
const outPath = path.resolve(__dirname, '..', 'front', 'src', 'utils', 'communes.generated.json');

function normalize(text) {
  if (!text && text !== 0) return '';
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0640]/g, '') // remove accents and Arabic marks/tatweel
    .replace(/[ءآأإ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/["'`]/g, '')
    .replace(/[\-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function run() {
  if (!fs.existsSync(frPath1) || !fs.existsSync(arPath)) {
    console.error('Primary JSON input files not found.');
    process.exit(1);
  }

  // Load French Data Sources
  const frList1 = JSON.parse(fs.readFileSync(frPath1, 'utf8'));
  let frList2 = [];
  if (fs.existsSync(frPath2)) {
    try {
      frList2 = JSON.parse(fs.readFileSync(frPath2, 'utf8'));
    } catch (e) {
      console.warn('Failed to parse second French source, skipping.');
    }
  }

  // Load Arabic Data Source
  const arData = JSON.parse(fs.readFileSync(arPath, 'utf8'));
  const arList = arData.communes || [];

  // Build Arabic Lookup Maps
  const arCodeMap = new Map(); // arKey -> arItem
  const arNameMap = new Map(); // normalizedAr -> arName
  for (const item of arList) {
    if (!item.codeC) continue;
    const key = parseInt(item.codeC, 10);
    arCodeMap.set(key, item);
    arNameMap.set(normalize(item.baladiya), item.baladiya);
  }

  const byCode = {};
  const arToFr = {};
  const frToFr = {};
  const byArWithWilaya = {};
  const byFrWithWilaya = {};

  const wilayaDisplayNames = {
    "1": "Adrar", "2": "Chlef", "3": "Laghouat", "4": "Oum El Bouaghi", "5": "Batna",
    "6": "Béjaïa", "7": "Biskra", "8": "Béchar", "9": "Blida", "10": "Bouira",
    "11": "Tamanrasset", "12": "Tébessa", "13": "Tlemcen", "14": "Tiaret", "15": "Tizi Ouzou",
    "16": "Alger", "17": "Djelfa", "18": "Jijel", "19": "Sétif", "20": "Saïda",
    "21": "Skikda", "22": "Sidi Bel Abbès", "23": "Annaba", "24": "Guelma", "25": "Constantine",
    "26": "Médéa", "27": "Mostaganem", "28": "M'Sila", "29": "Mascara", "30": "Ouargla",
    "31": "Oran", "32": "El Bayadh", "33": "Illizi", "34": "Bordj Bou Arreridj", "35": "Boumerdès",
    "36": "El Tarf", "37": "Tindouf", "38": "Tissemsilt", "39": "El Oued", "40": "Khenchela",
    "41": "Souk Ahras", "42": "Tipaza", "43": "Mila", "44": "Aïn Defla", "45": "Naâma",
    "46": "Aïn Témouchent", "47": "Ghardaïa", "48": "Relizane", "49": "Timimoun", "50": "Bordj Badji Mokhtar",
    "51": "Ouled Djellal", "52": "Beni Abbes", "53": "In Salah", "54": "In Guezzam", "55": "Touggourt",
    "56": "Djanet", "57": "El M'Ghair", "58": "El Meniaa"
  };

  const manualAliases = {
    "الجزائر": "Alger",
    "قسنطينة": "Constantine",
    "تقرت النزلة": "Touggourt",
    "النزلة": "Nezla",
    "نزلة": "Nezla",
    "بني مسوس": "Beni Messous",
    "تقرت": "Touggourt",
    "توقرت": "Touggourt",
    "عين البيضاء": "Ain Beida",
    "تمنراست": "Tamanrasset",
    "عين تيموشنت": "Aïn Témouchent",
    "المعالمة": "Mahelma",
    "سطاوالي": "Staoueli",
    "دلس": "Dellys",
    "بابا حسن": "Baba Hassen",
    "أولاد جلال": "Ouled Djellal",
    "مقلع": "Mekla",
    "الناظور": "Nador",
    "تندوف": "Tindouf",
    "برج بوعريرج": "Bordj Bou Arreridj",
    "الهرانفة": "Herenfa",
    "أحمر العين": "Ahmer El Ain",
    "الدار البيضاء": "Dar El Beida",
    "مشيرة": "Mechira",
    "الناضور": "Nador",
    "الجزاير": "Alger",
    "الجزاير العاصمة": "Alger",
    "بئر توتة": "Birtouta",
    "تسالة المرجة": "Tassala El Merdja",
    "أولاد شبل": "Ouled Chebel",
    "عين طاية": "Ain Taya",
    "برج البحري": "Bordj El Bahri",
    "المرسى": "Marsa",
    "هراوة": "Haraoua",
    "الرويبة": "Rouiba",
    "الرغاية": "Reghaia",
    "عين البنيان": "Ain Benian",
    "المحالمة": "Mahelma",
    "الرحمانية": "Rahmania",
    "السويدانية": "Souidania",
    "الشراقة": "Cheraga",
    "العاشور": "El Achour",
    "الدرارية": "Draria",
    "الدويرة": "Douera",
    "السحاولة": "Saoula",
    "اسطاوالي": "Staoueli",
    "زرالدة": "Zeralda"
  };

  const frToArManual = {
    "Mahelma": "المعالمة",
    "Staoueli": "سطاوالي",
    "Baba Hassen": "بابا حسن",
    "Nezla": "النزلة",
    "Tamanrasset": "تمنراست",
    "Ain Beida": "عين البيضاء",
    "Mechira": "مشيرة",
    "Nador": "الناظور",
    "Alger": "الجزائر",
    "Zeralda": "زرالدة",
    "Birtouta": "بئر توتة",
    "Tassala El Merdja": "تسالة المرجة",
    "Ouled Chebel": "أولاد شبل",
    "Ain Taya": "عين طاية",
    "Bordj El Bahri": "برج البحري",
    "Marsa": "المرسى",
    "Haraoua": "هراوة",
    "Rouiba": "الرويبة",
    "Reghaia": "الرغاية",
    "Ain Benian": "عين البنيان",
    "Mahelma": "المحالمة",
    "Rahmania": "الرحمانية",
    "Souidania": "السويدانية",
    "Cheraga": "الشراقة",
    "El Achour": "العاشور",
    "Draria": "الدرارية",
    "Douera": "الدويرة",
    "Saoula": "السحاولة"
  };

  // 1. Process French Sources to build the base map
  const processFrList = (list, codeField, nameField) => {
    for (const frItem of list) {
      const codePostal = String(frItem[codeField]).padStart(5, '0');
      const frName = frItem[nameField];
      const wId = parseInt(frItem.wilaya_id || frItem.codeW, 10);

      if (!frName || isNaN(wId)) continue;

      // Calculate Arabic key from codePostal
      // e.g. 16047 -> 1647
      const cpVal = parseInt(codePostal, 10);
      const arKey = (Math.floor(cpVal / 1000) * 100) + (cpVal % 1000);

      const arItem = arCodeMap.get(arKey);
      let arName = frToArManual[frName] || (arItem ? arItem.baladiya : '');
      let wilayaAr = (arItem && !frToArManual[frName]) ? arItem.wilaya : '';

      // Special case: if we found arName via manual alias, try to find its wilayaAr if not set
      if (arName && !wilayaAr) {
        // If we have an arItem from the arKey, use its wilaya if it belongs to the same wilaya code
        if (arItem && parseInt(arItem.codeW, 10) === wId) {
          wilayaAr = arItem.wilaya;
        } else {
          // Fallback: search for any entry with this arName to get its wilaya
          for (const item of arList) {
            if (item.baladiya === arName) {
              wilayaAr = item.wilaya;
              break;
            }
          }
        }
      }

      const entry = {
        codeC: codePostal,
        fr: frName,
        ar: arName,
        wilayaCode: String(wId),
        wilayaAr: wilayaAr,
        wilayaFr: wilayaDisplayNames[wId] || String(wId)
      };

      byCode[codePostal] = entry;

      // Populate lookup maps
      const nFr = normalize(frName);
      frToFr[nFr] = frName;
      if (entry.wilayaFr) {
        byFrWithWilaya[nFr + '||' + normalize(entry.wilayaFr)] = frName;
      }

      if (arName) {
        const nAr = normalize(arName);
        arToFr[nAr] = frName;
        if (wilayaAr) {
          byArWithWilaya[nAr + '||' + normalize(wilayaAr)] = frName;
        }
      }
    }
  };

  processFrList(frList1, 'codeC', 'fr');
  processFrList(frList2, 'code_postal', 'nom');

  // 2. Resolve leftover manual aliases
  for (const [arAlias, frTarget] of Object.entries(manualAliases)) {
    arToFr[normalize(arAlias)] = frTarget;
  }

  // 3. Ensure all 58 wilayas are mapped in arToFr
  const wilayaArNames = {
    "1": "أدرار", "2": "الشلف", "3": "الأغواط", "4": "أم البواقي", "5": "باتنة",
    "6": "بجاية", "7": "بسكرة", "8": "بشار", "9": "البليدة", "10": "البويرة",
    "11": "تمنراست", "12": "تبسة", "13": "تلمسان", "14": "تيارت", "15": "تيزي وزو",
    "16": "الجزائر", "17": "الجلفة", "18": "جيجل", "19": "سطيف", "20": "سعيدة",
    "21": "سكيكدة", "22": "سيدي بلعباس", "23": "عنابة", "24": "قالمة", "25": "قسنطينة",
    "26": "المدية", "27": "مستغانم", "28": "المسيلة", "29": "معسكر", "30": "ورقلة",
    "31": "وهران", "32": "البيض", "33": "إليزي", "34": "برج بوعريريج", "35": "بومرداس",
    "36": "الطارف", "37": "تندوف", "38": "تيسمسيلت", "39": "الوادي", "40": "خنشلة",
    "41": "سوق أهراس", "42": "تيبازة", "43": "ميلة", "44": "عين الدفلى", "45": "النعامة",
    "46": "عين تموشنت", "47": "غرداية", "48": "غليزان", "49": "تيميمون", "50": "برج باجي مختار",
    "51": "أولاد جلال", "52": "بني عباس", "53": "عين صالح", "54": "عين قزام", "55": "توقرت",
    "56": "جانت", "57": "المغير", "58": "المنيعة"
  };

  for (const [code, ar] of Object.entries(wilayaArNames)) {
    const fr = wilayaDisplayNames[code];
    if (fr) {
      arToFr[normalize(ar)] = fr;
      if (ar === "الجزائر") {
        arToFr[normalize("الجزائر العاصمة")] = fr;
        arToFr[normalize("Alger")] = fr;
      }
    }
  }

  const out = { byCode, arToFr, frToFr, byArWithWilaya, byFrWithWilaya };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

  console.log('Generated:', outPath);
  console.log('Communes in byCode:', Object.keys(byCode).length);
  console.log('Mappings in arToFr:', Object.keys(arToFr).length);
}

run();
