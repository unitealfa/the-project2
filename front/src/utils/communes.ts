import data from './communes.generated.json';

function normalize(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0640]/g, '') // remove accents and Arabic marks/tatweel
    .replace(/[ءآأإ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/['"`]/g, '')
    .replace(/[\-_.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveCommuneName(
  communeName: string | undefined | null,
  wilayaName?: string | undefined | null,
  wilayaCode?: number | string | undefined | null
): string | null {
  if (!communeName) return null;
  // Special-case: mentions of delivery to DHD office -> use fixed label
  try {
    const raw = String(communeName || "");
    if ((/توصيل/.test(raw) && /مكتب/.test(raw)) || /\bdhd\b/i.test(raw)) {
      // Prefer mapping the (possibly Arabic) commune to its canonical FR name first
      const n = normalize(communeName);
      if (n) {
        const arDirect = (data as any).arToFr?.[n];
        if (arDirect) return arDirect;
        if (wilayaName) {
          const wn = normalize(wilayaName);
          const byAr = (data as any).byArWithWilaya?.[n + '||' + wn];
          if (byAr) return byAr;
        }
        if (wilayaCode) {
          const codeStr = String(wilayaCode).padStart(2, '0');
          for (const [, entry] of Object.entries((data as any).byCode)) {
            const e = entry as any;
            if (String(e.codeC).startsWith(codeStr) && normalize(e.ar) === n) {
              return e.fr || null;
            }
          }
        }
      }

      // If no commune FR found, try to return a canonical FR wilaya name when provided
      if (wilayaName && String(wilayaName).trim()) {
        const wn = normalize(wilayaName);
        for (const [, entry] of Object.entries((data as any).byCode)) {
          const e = entry as any;
          if (normalize(e.wilayaAr) === wn || normalize(e.wilayaFr) === wn) {
            return e.wilayaFr || String(wilayaName).trim();
          }
        }
        // fallback to raw wilaya if nothing matched
        return String(wilayaName).trim();
      }

      return "bureau dhd";
    }
  } catch (e) {
    // ignore and continue
  }
  const n = normalize(communeName);
  if (!n) return null;

  // direct french match
  const frDirect = (data as any).frToFr?.[n];
  if (frDirect) return frDirect;

  // direct arabic match
  const arDirect = (data as any).arToFr?.[n];
  if (arDirect) return arDirect;

  // with wilaya disambiguation
  if (wilayaName) {
    const wn = normalize(wilayaName);
    const byAr = (data as any).byArWithWilaya?.[n + '||' + wn];
    if (byAr) return byAr;
    const byFr = (data as any).byFrWithWilaya?.[n + '||' + wn];
    if (byFr) return byFr;
  }

  // with wilaya code
  if (wilayaCode) {
    const codeStr = String(wilayaCode).padStart(2, '0');
    // try to find an entry where byCode has codeC starting with wilaya code
    for (const [, entry] of Object.entries((data as any).byCode)) {
      const e = entry as any;
      if (String(e.codeC).startsWith(codeStr) && normalize(e.ar) === n) {
        return e.fr || null;
      }
    }
  }

  return null;
}

export function getFrenchForDisplay(communeName: string, wilayaName?: string, wilayaCode?: number | string) {
  const resolved = resolveCommuneName(communeName, wilayaName, wilayaCode);
  return resolved || communeName;
}

export function getFrenchWilaya(wilayaName: string | undefined | null, wilayaCode?: number | string): string {
  if (!wilayaName && !wilayaCode) return '';
  const wn = normalize(wilayaName || '');

  // Try direct mapping first (for aliases and exact matches)
  if (wn && (data as any).arToFr[wn]) {
    return (data as any).arToFr[wn];
  }
  if (wn && (data as any).frToFr[wn]) {
    return (data as any).frToFr[wn];
  }

  const wc = wilayaCode ? String(wilayaCode).padStart(2, '0') : null;

  for (const [, entry] of Object.entries((data as any).byCode)) {
    const e = entry as any;
    if (wc && String(e.wilayaCode) === wc) return e.wilayaFr || String(wilayaName || '');
    if (wn && (normalize(e.wilayaAr) === wn || normalize(e.wilayaFr) === wn)) {
      return e.wilayaFr || String(wilayaName || '');
    }
  }
  return String(wilayaName || '');
}

export function getCommunesByWilaya(wilayaCode: number | string): { fr: string, ar: string }[] {
  const wc = String(wilayaCode).padStart(2, '0');
  const results: { fr: string, ar: string }[] = [];

  for (const [, entry] of Object.entries((data as any).byCode)) {
    const e = entry as any;
    if (String(e.codeC).startsWith(wc)) {
      results.push({ fr: e.fr, ar: e.ar });
    }
  }

  return results.sort((a, b) => a.fr.localeCompare(b.fr));
}

export default { resolveCommuneName, getFrenchForDisplay, getFrenchWilaya, getCommunesByWilaya };
