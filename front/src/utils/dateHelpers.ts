
export const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

export const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export type OrderRow = Record<string, any>;

const normalizeKey = (key: string) => key.trim().toLowerCase();

export const normalizeFieldKey = (key: string) =>
    key.trim().toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "");

export const parseSheetDateValue = (value: unknown, row?: OrderRow): Date | null => {
    if (!value && value !== 0) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return new Date(value.getTime());
    }

    const raw = String(value).trim();
    if (!raw) return null;

    // Check heuristics if row is provided
    let isMMDDYYYY = false;

    if (row) {
        // heuristics: 
        // 1. Phone does NOT start with '0' -> mm/dd/yyyy
        // 2. Content is French (no Arabic) -> mm/dd/yyyy

        // Find phone
        let phone = "";
        const phoneKeys = ["telephone", "phone", "tel", "numero", "mobile"];
        for (const key of Object.keys(row)) {
            if (phoneKeys.some(pk => normalizeKey(key).includes(pk))) {
                const val = String(row[key] || "").trim();
                // simple check if it looks like a phone number
                if (val.length > 8) {
                    phone = val;
                    break;
                }
            }
        }

        // Check for Arabic content in Wilaya or Commune
        const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);
        const wilaya = String(row["Wilaya"] || "");
        const commune = String(row["Commune"] || "");
        const isArabicContent = hasArabic(wilaya) || hasArabic(commune);

        if (phone && !phone.startsWith("0")) {
            isMMDDYYYY = true;
        } else if (!isArabicContent && (!phone || !phone.startsWith("0") || phone.startsWith("00"))) {
            // If no phone or phone doesn't start with 0, and no Arabic -> assume mm/dd/yyyy
            isMMDDYYYY = true;
        }

        // Priority rule: If phone starts with 0 (and not 00) -> DD/MM/YYYY
        if (phone && phone.startsWith("0") && !phone.startsWith("00")) {
            isMMDDYYYY = false;
        } else if (isArabicContent) {
            isMMDDYYYY = false;
        }
    }

    // Regex to capture parts
    const dateMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);

    if (dateMatch) {
        const [, p1, p2, p3, h, m, s] = dateMatch;
        let year = Number(p3);
        if (year < 100) year += 2000; // Assume 20xx

        const hours = h ? Number(h) : 0;
        const minutes = m ? Number(m) : 0;
        const seconds = s ? Number(s) : 0;

        let day, month;
        if (isMMDDYYYY) {
            month = Number(p1);
            day = Number(p2);
        } else {
            day = Number(p1);
            month = Number(p2);
        }

        // Attempt to construct date
        let dateCandidate: Date | null = null;
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            dateCandidate = new Date(year, month - 1, day, hours, minutes, seconds);
        }

        // Heuristic: Avoid future dates
        // If the date is significantly in the future (e.g. > 1 day ahead), check if swapping day/month fixes it.
        // Use a fixed reference for "now" if possible, or new Date()
        const now = new Date();
        // buffer of 24h
        const futureThreshold = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        if (dateCandidate && dateCandidate > futureThreshold) {
            // The resolved date is in the future. Try swapping.
            const swapMonth = Number(p2);
            const swapDay = Number(p1);

            let altDate: Date | null = null;
            if (isMMDDYYYY) {
                // currently MM/DD, try DD/MM
                // p1 was month, p2 was day. 
                // swap means p1 is day, p2 is month.
                // so swapMonth = p2, swapDay = p1.
                if (swapMonth >= 1 && swapMonth <= 12 && swapDay >= 1 && swapDay <= 31) {
                    altDate = new Date(year, swapMonth - 1, swapDay, hours, minutes, seconds);
                }
            } else {
                // currently DD/MM, try MM/DD
                // p1 was day, p2 was month.
                // swap means p1 is month, number p2 is day.
                // Wait, if isMMDDYYYY=false (DD/MM), p1=day, p2=month.
                // If we swap to MM/DD, p1=month, p2=day.
                const altM = Number(p1);
                const altD = Number(p2);
                if (altM >= 1 && altM <= 12 && altD >= 1 && altD <= 31) {
                    altDate = new Date(year, altM - 1, altD, hours, minutes, seconds);
                }
            }

            // If altDate exists and is NOT in the future (or is "more" in the past/reasonable)
            if (altDate && altDate <= futureThreshold) {
                return altDate;
            }

            // If altDate is also in the future? 
            // Or if dateCandidate was future but swapping didn't help?
            // Fallback: If dateCandidate is > threshold, but we have no better option, return it? 
            // Or blindly trust the swap if it makes sense?

            // Let's refine:
            // Case: `06/01/2026` parsed as MM/DD -> June 1 (Future). 
            // Swap -> Jan 6 (Past). -> Pick Jan 6.
            if (altDate && altDate <= futureThreshold) {
                return altDate;
            }
        }

        if (dateCandidate) return dateCandidate;
    }
    // Fallback to standard parsing if regex didn't match or invalid date
    const parsedTimestamp = Date.parse(raw);
    if (!Number.isNaN(parsedTimestamp)) {
        return new Date(parsedTimestamp);
    }

    const normalizedNumber = Number(raw.replace(",", "."));
    if (!Number.isNaN(normalizedNumber)) {
        // Excel date heuristic
        if (normalizedNumber > 30000 && normalizedNumber < 60000) {
            const millis = Math.round(normalizedNumber * 24 * 60 * 60 * 1000);
            const date = new Date(EXCEL_EPOCH + millis);
            return new Date(
                date.getUTCFullYear(),
                date.getUTCMonth(),
                date.getUTCDate(),
                date.getUTCHours(),
                date.getUTCMinutes(),
                date.getUTCSeconds(),
                date.getUTCMilliseconds()
            );
        }
    }

    return null;
};

export const extractRowDate = (row: OrderRow): Date | null => {
    const priorityKeys = [
        "date",
        "Date",
        "DATE",
        "Date de commande",
        "date de commande",
        "Created At",
        "created_at",
    ];

    for (const key of priorityKeys) {
        if (key in row) {
            const parsed = parseSheetDateValue(row[key], row);
            if (parsed) return parsed;
        }
    }

    for (const key of Object.keys(row)) {
        const normalizedKey = normalizeFieldKey(key);
        if (!normalizedKey) continue;
        if (!/date|jour|time|heure/.test(normalizedKey)) continue;
        const parsed = parseSheetDateValue(row[key], row);
        if (parsed) return parsed;
    }

    return null;
};
