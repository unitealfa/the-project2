import React, { useState, useMemo, useCallback, useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import "../styles/Orders.css";

// Simple, robust CSV parser supporting quoted fields and commas within quotes
function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentField = "";
  let currentRow: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\n") {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = "";
      } else if (char === "\r") {
        // ignore CR, will be handled by \n
      } else {
        currentField += char;
      }
    }
  }
  // push the last field/row if present
  if (currentField.length > 0 || inQuotes || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  return rows;
}

interface OrderRow {
  [key: string]: string;
}

const SHEET_ID = "1Z5etRgUtjHz2QiZm0SDW9vVHPcFxHPEvw08UY9i7P9Q";
const buildCsvUrl = () =>
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&cacheBust=${Date.now()}`;

type UpdateStatusContext = {
  previousStatus?: string;
  row?: OrderRow;
  tracking?: string;
};

type SheetStatus =
  | "new"
  | "abandoned"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "returned"
  | string;

const SHEET_SYNC_ENDPOINT =
  import.meta.env.VITE_SHEET_SYNC_ENDPOINT ?? "/api/orders/status";

type TimeFilter = "all" | "day" | "week" | "month";

const TIME_FILTER_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "day", label: "Jour" },
  { value: "week", label: "Semaine" },
  { value: "month", label: "Mois" },
];

const PaperPlaneIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M3.16 3.11a1 1 0 0 1 1.08-.16l16 6.67a1 1 0 0 1 0 1.84l-16 6.67A1 1 0 0 1 2 17.47l4.55-5.47L2 6.53a1 1 0 0 1 1.16-1.42Zm6.17 8.89-2.81 3.37 10.21-4.26-10.21-4.26 2.81 3.37a1 1 0 0 1 0 1.78Z"
      fill="currentColor"
    />
  </svg>
);

const CrossCircleIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.54 12.46a1 1 0 0 1-1.41 1.41L12 13.75l-2.12 2.12a1 1 0 0 1-1.41-1.41L10.59 12 8.47 9.88a1 1 0 0 1 1.41-1.41L12 10.59l2.12-2.12a1 1 0 1 1 1.41 1.41L13.41 12l2.13 2.12Z"
      fill="currentColor"
    />
  </svg>
);

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseSheetDateValue = (value: unknown): Date | null => {
  if (!value && value !== 0) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const parsedTimestamp = Date.parse(raw);
  if (!Number.isNaN(parsedTimestamp)) {
    return new Date(parsedTimestamp);
  }

  const normalizedNumber = Number(raw.replace(",", "."));
  if (!Number.isNaN(normalizedNumber)) {
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

  const isoMatch = raw.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (isoMatch) {
    const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] =
      isoMatch;
    const year = Number(yearStr);
    const month = Number(monthStr) - 1;
    const day = Number(dayStr);
    const hours = hourStr ? Number(hourStr) : 0;
    const minutes = minuteStr ? Number(minuteStr) : 0;
    const seconds = secondStr ? Number(secondStr) : 0;
    const date = new Date(year, month, day, hours, minutes, seconds);
    if (!Number.isNaN(date.getTime())) return date;
  }

  const frMatch = raw.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (frMatch) {
    const [, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] =
      frMatch;
    let year = Number(yearStr);
    if (year < 100) {
      year += year >= 50 ? 1900 : 2000;
    }
    const month = Number(monthStr) - 1;
    const day = Number(dayStr);
    const hours = hourStr ? Number(hourStr) : 0;
    const minutes = minuteStr ? Number(minuteStr) : 0;
    const seconds = secondStr ? Number(secondStr) : 0;
    const date = new Date(year, month, day, hours, minutes, seconds);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
};

const extractRowDate = (row: OrderRow): Date | null => {
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
      const parsed = parseSheetDateValue(row[key]);
      if (parsed) return parsed;
    }
  }

  for (const key of Object.keys(row)) {
    const normalizedKey = normalizeFieldKey(key);
    if (!normalizedKey) continue;
    if (!/date|jour|time|heure/.test(normalizedKey)) continue;
    const parsed = parseSheetDateValue(row[key]);
    if (parsed) return parsed;
  }

  return null;
};

const getRowStatus = (row: OrderRow): string => {
  const rawStatus = row["etat"] ?? row["État"] ?? row["Etat"];
  const status =
    typeof rawStatus === "string"
      ? rawStatus.trim()
      : String(rawStatus ?? "").trim();
  return status || "new";
};

const PAGE_SIZE = 100;

const isNetworkError = (error: unknown) => {
  if (error instanceof TypeError) return true;
  if (!error) return false;
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && "message" in error
      ? String((error as any).message ?? "")
      : "";
  if (!message) return false;
  return /Failed to fetch|NetworkError|ECONNREFUSED|ECONNRESET|ENOTFOUND/i.test(
    message
  );
};

const DEFAULT_DHD_BASE_URL = "https://platform.dhd-dz.com";
const DHD_API_BASE_URL = (
  import.meta.env.VITE_DHD_API_URL ?? DEFAULT_DHD_BASE_URL
).replace(/\/$/, "");
const DHD_API_TOKEN =
  import.meta.env.VITE_DHD_API_TOKEN ??
  "FmEdYRuMKmZOksnzHz2gvNhassrqr8wYNf4Lwcvn2EuOkTO9VZ1RXZb1nj4i";
const DHD_CREATE_PATH = "/api/v1/create/order";
const DHD_TRACKING_PATH = "/api/v1/get/tracking/info";

const buildDhdUrl = (path: string) => `${DHD_API_BASE_URL}${path}`;

const normalizeStatus = (status: string) =>
  status
    .replace(/_/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const DHD_STATUS_MAP: Record<string, SheetStatus> = {
  "vers station": "shipped",
  "en station": "shipped",
  "vers wilaya": "shipped",
  "en preparation": "shipped",
  "en livraison": "shipped",
  suspendus: "shipped",
  livred: "delivered",
  delivered: "delivered",
  "return asked": "returned",
  "return in transit": "returned",
  "return received": "returned",
};

const mapDhdStatusToSheet = (status: unknown): SheetStatus | null => {
  if (typeof status !== "string") return null;
  const normalized = normalizeStatus(status);
  return DHD_STATUS_MAP[normalized] ?? null;
};

const normalizeFieldKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const extractTrackingStatus = (payload: any): string | null => {
  if (!payload || typeof payload !== "object") return null;
  if (typeof payload.status === "string") return payload.status;
  if (payload.data && typeof payload.data.status === "string")
    return payload.data.status;
  if (payload.order && typeof payload.order.status === "string")
    return payload.order.status;
  if (payload.tracking && typeof payload.tracking.status === "string")
    return payload.tracking.status;
  return null;
};

const Orders: React.FC = () => {
  const { token } = useContext(AuthContext);
  const [rows, setRows] = React.useState<OrderRow[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [statusSyncDisabled, setStatusSyncDisabled] =
    React.useState<boolean>(false);
  const syncDisabledRef = React.useRef<boolean>(false);
  // Adresse saisie par l'utilisateur pour chaque commande (indexée par idx)

  // Composant optimisé pour une ligne de commande
  // Table de correspondance wilaya_name -> wilaya_id
  const WILAYAS = [
    { wilaya_id: 1, wilaya_name: "Adrar" },
    { wilaya_id: 2, wilaya_name: "Chlef" },
    { wilaya_id: 3, wilaya_name: "Laghouat" },
    { wilaya_id: 4, wilaya_name: "Oum El Bouaghi" },
    { wilaya_id: 5, wilaya_name: "Batna" },
    { wilaya_id: 6, wilaya_name: "Béjaïa" },
    { wilaya_id: 7, wilaya_name: "Biskra" },
    { wilaya_id: 8, wilaya_name: "Béchar" },
    { wilaya_id: 9, wilaya_name: "Blida" },
    { wilaya_id: 10, wilaya_name: "Bouira" },
    { wilaya_id: 11, wilaya_name: "Tamanrasset" },
    { wilaya_id: 12, wilaya_name: "Tébessa" },
    { wilaya_id: 13, wilaya_name: "Tlemcen" },
    { wilaya_id: 14, wilaya_name: "Tiaret" },
    { wilaya_id: 15, wilaya_name: "Tizi Ouzou" },
    { wilaya_id: 16, wilaya_name: "Alger" },
    { wilaya_id: 17, wilaya_name: "Djelfa" },
    { wilaya_id: 18, wilaya_name: "Jijel" },
    { wilaya_id: 19, wilaya_name: "Sétif" },
    { wilaya_id: 20, wilaya_name: "Saïda" },
    { wilaya_id: 21, wilaya_name: "Skikda" },
    { wilaya_id: 22, wilaya_name: "Sidi Bel Abbès" },
    { wilaya_id: 23, wilaya_name: "Annaba" },
    { wilaya_id: 24, wilaya_name: "Guelma" },
    { wilaya_id: 25, wilaya_name: "Constantine" },
    { wilaya_id: 26, wilaya_name: "Médéa" },
    { wilaya_id: 27, wilaya_name: "Mostaganem" },
    { wilaya_id: 28, wilaya_name: "M'Sila" },
    { wilaya_id: 29, wilaya_name: "Mascara" },
    { wilaya_id: 30, wilaya_name: "Ouargla" },
    { wilaya_id: 31, wilaya_name: "Oran" },
    { wilaya_id: 32, wilaya_name: "El Bayadh" },
    { wilaya_id: 33, wilaya_name: "Illizi" },
    { wilaya_id: 34, wilaya_name: "Bordj Bou Arreridj" },
    { wilaya_id: 35, wilaya_name: "Boumerdès" },
    { wilaya_id: 36, wilaya_name: "El Tarf" },
    { wilaya_id: 37, wilaya_name: "Tindouf" },
    { wilaya_id: 38, wilaya_name: "Tissemsilt" },
    { wilaya_id: 39, wilaya_name: "El Oued" },
    { wilaya_id: 40, wilaya_name: "Khenchela" },
    { wilaya_id: 41, wilaya_name: "Souk Ahras" },
    { wilaya_id: 42, wilaya_name: "Tipaza" },
    { wilaya_id: 43, wilaya_name: "Mila" },
    { wilaya_id: 44, wilaya_name: "Aïn Defla" },
    { wilaya_id: 45, wilaya_name: "Naâma" },
    { wilaya_id: 46, wilaya_name: "Aïn Témouchent" },
    { wilaya_id: 47, wilaya_name: "Ghardaïa" },
    { wilaya_id: 48, wilaya_name: "Relizane" },
  ];

  function getWilayaIdByName(name: string) {
    const normalize = (s: string) =>
      (s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ +/g, " ");
    const target = normalize(name);
    const found = WILAYAS.find((w) => normalize(w.wilaya_name) === target);
    return found ? found.wilaya_id : 16; // Fallback Alger si non reconnu
  }

  const normalizePhone = (phone: string): string => {
    if (!phone) return "";

    let normalized = phone.replace(/\D/g, "");
    if (normalized.startsWith("0")) {
      return normalized;
    }
    if (normalized.startsWith("213")) {
      return "0" + normalized.substring(3);
    }
    if (normalized.length === 9) {
      return "0" + normalized;
    }
    return normalized;
  };

  const formatPhoneForDisplay = (
    rawPhone: string,
    normalizedPhone: string
  ): string => {
    const trimmedRaw = (rawPhone || "").trim();
    const normalizedDigits = (normalizedPhone || "").replace(/\D/g, "");

    if (!normalizedDigits) {
      return trimmedRaw;
    }

    const groupedDigits = normalizedDigits
      .replace(/(\d{2})(?=\d)/g, "$1 ")
      .trim();

    if (!trimmedRaw) {
      return groupedDigits;
    }

    const rawDigits = trimmedRaw.replace(/\D/g, "");
    if (rawDigits === normalizedDigits) {
      return groupedDigits;
    }

    if (!trimmedRaw.startsWith("0") && normalizedDigits.startsWith("0")) {
      return groupedDigits;
    }

    return trimmedRaw;
  };

  const normalizeName = (name: string): string => {
    if (!name) return "";

    return name
      .replace(/[éèêë]/g, "e")
      .replace(/[àâä]/g, "a")
      .replace(/[ùûü]/g, "u")
      .replace(/[îï]/g, "i")
      .replace(/[ôö]/g, "o")
      .replace(/[ç]/g, "c")
      .replace(/[ñ]/g, "n")
      .replace(/[ý]/g, "y")
      .replace(/[æ]/g, "ae")
      .replace(/[œ]/g, "oe")
      .replace(/['\'\`]/g, "")
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const extractOrderSummary = (
    row: OrderRow
  ): {
    name: string;
    rawName: string;
    phoneDial: string;
    displayPhone: string;
    status: SheetStatus;
    rowId: string;
    displayRowLabel: string;
  } => {
    const canonicalName = String(row["Nom du client"] ?? "").trim();
    let rawName = canonicalName;

    if (!rawName) {
      for (const key of Object.keys(row)) {
        const normalizedKey = normalizeFieldKey(key);
        if (!normalizedKey) continue;
        const tokens = normalizedKey
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const hasClient = tokens.some(
          (token) => token === "client" || token === "customer"
        );
        const hasName = tokens.some(
          (token) => token === "nom" || token === "name"
        );
        if (hasClient && hasName && row[key]) {
          rawName = row[key];
          break;
        }
      }
    }

    const canonicalPhone = String(row["Numero"] ?? row["Numéro"] ?? "").trim();
    let rawPhone = canonicalPhone;

    if (!rawPhone) {
      for (const key of Object.keys(row)) {
        const normalizedKey = normalizeFieldKey(key);
        if (!normalizedKey) continue;
        const tokens = normalizedKey
          .replace(/[^a-z0-9]+/g, " ")
          .trim()
          .split(/\s+/)
          .filter(Boolean);
        const isPhone = tokens.some(
          (token) =>
            token === "numero" ||
            token === "telephone" ||
            token === "tel" ||
            token === "phone"
        );
        if (isPhone && row[key]) {
          rawPhone = row[key];
          break;
        }
      }
    }

    const phoneDial = normalizePhone(rawPhone);
    const displayPhone = formatPhoneForDisplay(rawPhone, phoneDial);
    const sheetRowId = String(row["id-sheet"] ?? "").trim();
    const fallbackRowId = String(row["ID"] ?? "").trim();
    const rowId = sheetRowId || fallbackRowId;
    const displayRowLabel = fallbackRowId || sheetRowId;
    const status = (String(
      row["etat"] ?? row["État"] ?? row["Etat"] ?? ""
    ).trim() || "new") as SheetStatus;

    return {
      name: normalizeName(rawName),
      rawName: rawName?.toString() ?? "",
      phoneDial,
      displayPhone,
      status,
      rowId,
      displayRowLabel,
    };
  };

  type OrderSummary = ReturnType<typeof extractOrderSummary>;

  const OrderActionButtons = React.memo(function OrderActionButtons({
    row,
    summary,
    onUpdateStatus,
    onDelivered,
    variant = "table",
  }: {
    row: OrderRow;
    summary: OrderSummary;
    onUpdateStatus: (
      rowId: string,
      status: SheetStatus,
      context?: UpdateStatusContext
    ) => Promise<void>;
    onDelivered: (
      payload: {
        code?: string;
        name?: string;
        variant: string;
        quantity: number;
      },
      rowId: string
    ) => Promise<void>;
    variant?: "table" | "modal";
  }) {
    const {
      name: nom_client,
      phoneDial: telephone,
      status: initialSheetStatus,
      rowId,
      displayRowLabel,
    } = summary;

    const telephone_2 = telephone;
    const code_wilaya = getWilayaIdByName(row["Wilaya"]);

    const stop_desk = (() => {
      const rawType = String(row["Type de livraison"] || "").toLowerCase();
      return rawType.includes("stop") ? "1" : "0";
    })();

    const totalForApi = (() => {
      const parseAmount = (value: unknown): number | null => {
        if (value === undefined || value === null) return null;
        const cleaned = String(value)
          .replace(/\s+/g, "")
          .replace(/[^\d,.-]/g, "")
          .replace(/,/g, ".");
        if (!cleaned) return null;
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const quantityForTotal = (() => {
        const raw = String(
          row["Quantité"] || row["Quantite"] || row["Qte"] || "1"
        );
        const sanitized = raw.replace(/[^\d]/g, "");
        const n = parseInt(sanitized, 10);
        return Number.isNaN(n) || n <= 0 ? 1 : n;
      })();

      const unitPriceForTotal = (() => {
        const candidates = ["Prix unitaire", "Prix", "PrixU", "PU", "Prix U"];
        for (const key of candidates) {
          if (key in row) {
            const parsed = parseAmount(row[key]);
            if (parsed !== null) return parsed;
          }
        }
        return null;
      })();

      const amountFromSheet = (() => {
        const candidates = [
          "Total",
          "total",
          "Montant",
          "Montant total",
          "Prix total",
        ];
        for (const key of candidates) {
          if (key in row) {
            const parsed = parseAmount(row[key]);
            if (parsed !== null) return parsed;
          }
        }
        return null;
      })();

      const computedFromUnit =
        unitPriceForTotal !== null
          ? unitPriceForTotal * quantityForTotal
          : null;
      return amountFromSheet ?? computedFromUnit ?? quantityForTotal * 1000;
    })();

    const smartCommuneResolver = (
      communeName: string,
      wilayaName: string,
      wilayaCode: number
    ): string => {
      const normalizeText = (text: string): string => {
        if (!text) return "";
        return text
          .replace(/[éèêë]/g, "e")
          .replace(/[àâä]/g, "a")
          .replace(/[ùûü]/g, "u")
          .replace(/[îï]/g, "i")
          .replace(/[ôö]/g, "o")
          .replace(/[ç]/g, "c")
          .replace(/[ñ]/g, "n")
          .replace(/[ý]/g, "y")
          .replace(/[æ]/g, "ae")
          .replace(/[œ]/g, "oe")
          .replace(/['`]/g, "")
          .replace(/[-_]/g, " ")
          .replace(/\b(centre|ville|commune|wilaya|daira)\b/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
      };

      const aliasMap: Record<string, string> = {
        birtouta: "bir touta",
        khraicia: "khraissia",
        "el harrach": "el harrach",
        "dar el beida": "dar el beida",
      };

      const normalizedCommune = normalizeText(communeName);
      if (normalizedCommune) {
        return aliasMap[normalizedCommune] || normalizedCommune;
      }

      const normalizedWilaya = normalizeText(wilayaName);
      if (normalizedWilaya) {
        return aliasMap[normalizedWilaya] || normalizedWilaya;
      }

      const wilaya = WILAYAS.find((w) => w.wilaya_id === wilayaCode);
      if (wilaya) {
        const fromCode = normalizeText(wilaya.wilaya_name);
        return aliasMap[fromCode] || fromCode || "alger";
      }

      return "alger";
    };

    const [submitting, setSubmitting] = React.useState<boolean>(false);
    const [delivering, setDelivering] = React.useState<boolean>(false);
    const [abandoning, setAbandoning] = React.useState<boolean>(false);

    const handleSendToApi = React.useCallback(async () => {
      const confirmed = window.confirm(
        `Êtes-vous sûr de vouloir envoyer la validation pour ${nom_client} ?`
      );
      if (!confirmed) {
        return;
      }

      const adr = ".";
      const produit = row["Produit"] || "";
      const remarque = row["ID"] || "";

      const realClientData = {
        nom_client: nom_client || "CLIENT_INCONNU",
        telephone: telephone || "0000000000",
        telephone_2: telephone_2 || "0000000000",
        adresse: adr,
        code_wilaya: parseInt(String(code_wilaya)) || 16,
        montant: String(Math.round(totalForApi)),
        type: "1",
        stop_desk: stop_desk || "0",
        stock: "0",
        fragile: "0",
        produit: produit,
        remarque: remarque,
      };

      const commune = smartCommuneResolver(
        row["Commune"] || "",
        row["Wilaya"] || "",
        parseInt(String(code_wilaya)) || 16
      );

      const finalData = {
        ...realClientData,
        commune: commune || "alger",
      };

      console.log("Données normalisées:", {
        original_commune: row["Commune"],
        resolved_commune: commune,
        original_phone: row["Numero"] || row["Téléphone"],
        normalized_phone: telephone,
        original_name: row["Nom du client"],
        normalized_name: nom_client,
        wilaya_code: code_wilaya,
      });

      let currentStatus: SheetStatus = initialSheetStatus;

      const applyStatusUpdate = async (
        nextStatus: SheetStatus,
        trackingValue: string
      ) => {
        await onUpdateStatus(rowId, nextStatus, {
          previousStatus: currentStatus,
          row: { ...row, etat: nextStatus },
          tracking: trackingValue || undefined,
        });
        currentStatus = nextStatus;
      };

      const syncTrackingStatus = async (trackingValue: string) => {
        if (!trackingValue) return;
        const trackingUrl = `${buildDhdUrl(
          DHD_TRACKING_PATH
        )}?tracking=${encodeURIComponent(trackingValue)}`;
        const controllerTracking = new AbortController();
        const timeoutTracking = setTimeout(
          () => controllerTracking.abort(),
          10000
        );
        try {
          const respTracking = await fetch(trackingUrl, {
            method: "GET",
            headers: {
              ...(DHD_API_TOKEN
                ? { Authorization: `Bearer ${DHD_API_TOKEN}` }
                : {}),
            },
            signal: controllerTracking.signal,
          });
          const textTracking = await respTracking.text();
          let dataTracking: any;
          try {
            dataTracking = JSON.parse(textTracking);
          } catch {
            dataTracking = textTracking;
          }
          if (!respTracking.ok) {
            throw new Error(
              `HTTP ${respTracking.status} - ${
                typeof dataTracking === "string"
                  ? dataTracking
                  : JSON.stringify(dataTracking)
              }`
            );
          }
          const mappedStatus = mapDhdStatusToSheet(
            extractTrackingStatus(dataTracking)
          );
          if (mappedStatus && mappedStatus !== currentStatus) {
            await applyStatusUpdate(mappedStatus, trackingValue);
          }
        } catch (trackingError) {
          console.error(
            "Erreur lors de la récupération du statut DHD",
            trackingError
          );
        } finally {
          clearTimeout(timeoutTracking);
        }
      };

      const resolveTracking = (payload: any): string => {
        if (!payload || typeof payload !== "object") return "";
        if (typeof payload.tracking === "string") return payload.tracking;
        if (payload.data && typeof payload.data.tracking === "string")
          return payload.data.tracking;
        if (payload.order && typeof payload.order.tracking === "string")
          return payload.order.tracking;
        return "";
      };

      try {
        setSubmitting(true);
        const url = buildDhdUrl(DHD_CREATE_PATH);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        console.log("Envoi vers DHD (POST JSON):", url);
        console.log("Données:", finalData);

        const doPost = async (payload: any) => {
          const resp = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(DHD_API_TOKEN
                ? { Authorization: `Bearer ${DHD_API_TOKEN}` }
                : {}),
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          const text = await resp.text();
          let data: any;
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
          return { resp, data };
        };

        let response: Response | undefined;
        let responseData: any;
        try {
          ({ resp: response, data: responseData } = await doPost(finalData));
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response) {
          throw new Error("Réponse API vide");
        }

        console.log("Réponse DHD:", response);
        console.log("Données de réponse:", responseData);

        if (
          response.ok &&
          (response.status === 200 || response.status === 201)
        ) {
          const trackingValue = resolveTracking(responseData) || "N/A";

          const toast = document.createElement("div");
          toast.textContent = `✅ Commande envoyée avec succès (${nom_client})`;
          Object.assign(toast.style, {
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(34,197,94,0.3)",
            fontSize: "0.9rem",
            fontWeight: "600",
            zIndex: "2000",
            opacity: "0",
            transition: "opacity 0.3s ease",
          });
          document.body.appendChild(toast);
          setTimeout(() => (toast.style.opacity = "1"), 50);
          setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 400);
          }, 3000);

          await applyStatusUpdate("ready_to_ship", trackingValue);
          await syncTrackingStatus(
            trackingValue === "N/A" ? "" : trackingValue
          );
        } else if (response.status === 422) {
          const msg =
            responseData &&
            typeof responseData === "object" &&
            "message" in responseData
              ? String(responseData.message)
              : "";
          const isCommuneIssue = msg.toLowerCase().includes("commune");

          if (isCommuneIssue) {
            const candidates: string[] = [];
            const seen = new Set<string>();
            const norm = (s: string) =>
              (s || "")
                .toLowerCase()
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "")
                .replace(/[^a-z\s]/g, "")
                .replace(/\s+/g, " ")
                .trim();

            const pushCandidate = (c: string) => {
              const key = norm(c);
              if (key && !seen.has(key)) {
                seen.add(key);
                candidates.push(c);
              }
            };

            pushCandidate(String(finalData.commune || ""));
            pushCandidate(String(row["Wilaya"] || ""));
            const codeNum = parseInt(String(code_wilaya)) || 16;
            if (codeNum === 16) {
              [
                "alger",
                "el harrach",
                "dar el beida",
                "khraissia",
                "bir touta",
                "bir mourad rais",
              ].forEach(pushCandidate);
            }

            let success = false;
            for (const communeCandidate of candidates) {
              const attemptData = { ...finalData, commune: communeCandidate };
              console.log("Retry avec commune:", communeCandidate);
              try {
                const controllerRetry = new AbortController();
                const timeoutRetry = setTimeout(
                  () => controllerRetry.abort(),
                  10000
                );
                try {
                  const { resp: r2, data: d2 } = await (async () => {
                    const r = await fetch(url, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(DHD_API_TOKEN
                          ? { Authorization: `Bearer ${DHD_API_TOKEN}` }
                          : {}),
                      },
                      body: JSON.stringify(attemptData),
                      signal: controllerRetry.signal,
                    });
                    const text2 = await r.text();
                    let data2: any;
                    try {
                      data2 = JSON.parse(text2);
                    } catch {
                      data2 = text2;
                    }
                    return { resp: r, data: data2 };
                  })();
                  clearTimeout(timeoutRetry);
                  if (r2.ok && (r2.status === 200 || r2.status === 201)) {
                    const trackingValue = resolveTracking(d2) || "N/A";
                    await applyStatusUpdate("ready_to_ship", trackingValue);
                    await syncTrackingStatus(
                      trackingValue === "N/A" ? "" : trackingValue
                    );
                    success = true;
                    break;
                  }
                  console.warn(
                    `Échec retry commune (${
                      r2.status
                    }) lors du fallback\n\n${JSON.stringify(d2, null, 2)}`
                  );
                } finally {
                  clearTimeout(timeoutRetry);
                }
              } catch (e) {
                console.log("Erreur retry commune", e);
              }
            }

            if (!success) {
              alert(
                `❌ Erreur de validation (422)\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(
                  responseData,
                  null,
                  2
                )}\n\nEssais effectués: ${candidates.join(", ")}`
              );
            }
          } else {
            alert(
              `❌ Erreur de validation (422)\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(
                responseData,
                null,
                2
              )}`
            );
          }
        } else if (response.status === 429) {
          alert(
            `⚠️ Trop de requêtes (429)\n\nClient: ${nom_client}\n\nVeuillez réessayer plus tard.`
          );
        } else {
          alert(
            `❌ Erreur API (${
              response.status
            })\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(
              responseData,
              null,
              2
            )}`
          );
        }
      } catch (error) {
        console.error("Erreur lors de l'appel API:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        alert(
          `❌ Erreur réseau\n\nClient: ${nom_client}\n\nErreur: ${errorMessage}`
        );
      } finally {
        setSubmitting(false);
      }
    }, [
      nom_client,
      telephone,
      telephone_2,
      code_wilaya,
      totalForApi,
      stop_desk,
      row,
      onUpdateStatus,
      initialSheetStatus,
      rowId,
    ]);

    const handleMarkAbandoned = React.useCallback(async () => {
      const confirmed = window.confirm(
        `Confirmer l'abandon de la commande ${displayRowLabel || ""} ?`
      );
      if (!confirmed) return;
      try {
        setAbandoning(true);
        await onUpdateStatus(rowId, "abandoned", {
          previousStatus: initialSheetStatus,
          row: { ...row, etat: "abandoned" },
        });
      } catch (e: any) {
        const message =
          e?.message || "Erreur lors de la mise à jour du statut abandonné";
        alert(message);
      } finally {
        setAbandoning(false);
      }
    }, [displayRowLabel, initialSheetStatus, onUpdateStatus, row, rowId]);

    const handleMarkDelivered = React.useCallback(async () => {
      try {
        setDelivering(true);
        const quantity =
          parseInt(
            String(
              row["Quantité"] || row["Quantite"] || row["Qte"] || "1"
            ).replace(/[^\d]/g, "")
          ) || 1;
        const name = String(row["Produit"] || "").trim();
        const variant =
          String(
            row["Variante"] || row["Variation"] || row["Taille"] || "default"
          ).trim() || "default";
        await onDelivered({ name, variant, quantity }, rowId);
        await onUpdateStatus(rowId, "delivered", {
          previousStatus: initialSheetStatus,
          row: { ...row, etat: "delivered" },
        });
      } catch (e: any) {
        alert(e?.message || "Erreur lors de la livraison");
      } finally {
        setDelivering(false);
      }
    }, [initialSheetStatus, onDelivered, onUpdateStatus, row, rowId]);

    const containerClass =
      variant === "modal" ? "orders-modal__actions" : "orders-table__actions";

    if (variant === "modal") {
      return (
        <div className={containerClass}>
          <button
            type="button"
            onClick={handleSendToApi}
            disabled={submitting || delivering || abandoning}
            className={`orders-button orders-button--primary orders-modal__action-button${
              submitting ? " is-loading" : ""
            }`}
          >
            {submitting ? "Envoi…" : "Confirmer et envoyer"}
          </button>
          <button
            type="button"
            onClick={handleMarkDelivered}
            disabled={delivering || submitting || abandoning}
            className={`orders-button orders-button--success orders-modal__action-button${
              delivering ? " is-loading" : ""
            }`}
          >
            {delivering ? "Traitement…" : "Marquer livrée"}
          </button>
          <button
            type="button"
            onClick={handleMarkAbandoned}
            disabled={abandoning || submitting}
            className={`orders-button orders-button--danger orders-modal__action-button${
              abandoning ? " is-loading" : ""
            }`}
          >
            {abandoning ? "Abandon…" : "Abandonnée"}
          </button>
        </div>
      );
    }

    return (
      <div className={containerClass}>
        <button
          type="button"
          onClick={handleSendToApi}
          disabled={submitting || abandoning}
          className={`orders-button orders-button--primary orders-button--icon${
            submitting ? " is-loading" : ""
          }`}
          aria-label={submitting ? "Envoi en cours…" : "Envoyer la validation"}
          title="Envoyer la validation"
        >
          {submitting ? (
            "Envoi…"
          ) : (
            <PaperPlaneIcon
              aria-hidden="true"
              className="orders-button__icon"
            />
          )}
        </button>
        <button
          type="button"
          onClick={handleMarkAbandoned}
          disabled={abandoning || submitting}
          className={`orders-button orders-button--danger${
            abandoning ? " is-loading" : ""
          }`}
        >
          {abandoning ? "Abandon…" : "Abandonnée"}
        </button>
        <button
          type="button"
          onClick={handleMarkDelivered}
          disabled={delivering || submitting || abandoning}
          className={`orders-button orders-button--success${
            delivering ? " is-loading" : ""
          }`}
        >
          {delivering ? "Traitement…" : "Marquer livrée (décrémenter stock)"}
        </button>
      </div>
    );
  });

  const OrderRowItem = React.memo(function OrderRowItem({
    row,
    idx,
    headers,
    onUpdateStatus,
    onDelivered,
    onVariantClick,
  }: {
    row: OrderRow;
    idx: number;
    headers: string[];
    onUpdateStatus: (
      rowId: string,
      status: SheetStatus,
      context?: UpdateStatusContext
    ) => Promise<void>;
    onDelivered: (
      payload: {
        code?: string;
        name?: string;
        variant: string;
        quantity: number;
      },
      rowId: string
    ) => Promise<void>;
    onVariantClick: (row: OrderRow) => void;
  }) {
    const summary = extractOrderSummary(row);
    const { name: nom_client, phoneDial: telephone } = summary;

    const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
    const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

    const handleCopyValue = React.useCallback((value: string, key: string) => {
      const text = (value || "").toString().trim();
      if (!text) return;

      const finalize = () => {
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        setCopiedKey(key);
        copyTimeoutRef.current = setTimeout(() => {
          setCopiedKey(null);
        }, 2000);
      };

      const attemptFallbackCopy = () => {
        if (typeof document === "undefined") return;
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          const result = document.execCommand("copy");
          if (result) {
            finalize();
          }
        } catch (error) {
          console.error("Impossible de copier le texte", error);
        } finally {
          document.body.removeChild(textarea);
        }
      };

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        navigator.clipboard.writeText
      ) {
        navigator.clipboard
          .writeText(text)
          .then(finalize)
          .catch(attemptFallbackCopy);
      } else {
        attemptFallbackCopy();
      }
    }, []);

    React.useEffect(
      () => () => {
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
      },
      []
    );

    return (
      <tr className="orders-row">
        {headers.map((h) => {
          const normalizedHeader = (h || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, " ");

          const displayValue = (() => {
            if (
              normalizedHeader.includes("nom") &&
              normalizedHeader.includes("client")
            ) {
              return nom_client || row[h] || row["Nom du client"] || "";
            }

            if (
              normalizedHeader.includes("numero") ||
              normalizedHeader.includes("telephone") ||
              normalizedHeader.includes("tel") ||
              /\b(n|no|num)\b/.test(normalizedHeader)
            ) {
              return (
                telephone || row[h] || row["Numero"] || row["Numéro"] || ""
              );
            }

            return row[h] || "";
          })();

          const displayText = String(displayValue ?? "");
          const trimmedDisplayText = displayText.trim();
          const normalizedHeaderKey = normalizedHeader.replace(/\s+/g, "");
          const isIdSheetColumn = normalizedHeaderKey === "idsheet";
          const isPhoneColumn =
            (normalizedHeader.includes("numero") ||
              normalizedHeader.includes("telephone") ||
              normalizedHeader.includes("tel") ||
              /\b(n|no|num)\b/.test(normalizedHeader)) &&
            !isIdSheetColumn;
          const isVariantColumn =
            normalizedHeader.includes("variante") ||
            normalizedHeader.includes("variation") ||
            normalizedHeader.includes("taille");
          const copyKey = `${idx}-${normalizedHeader || h}`;

          if (isVariantColumn) {
            if (!trimmedDisplayText) {
              return (
                <td
                  key={h}
                  className="orders-table__cell orders-table__cell--variant"
                >
                  <span className="orders-table__muted">—</span>
                </td>
              );
            }

            return (
              <td
                key={h}
                className="orders-table__cell orders-table__cell--variant"
              >
                <button
                  type="button"
                  className="orders-table__variant"
                  onClick={() => onVariantClick(row)}
                  title="Cliquer pour changer la variante"
                >
                  <span className="orders-table__variant-name">
                    {trimmedDisplayText}
                  </span>
                  <svg
                    className="orders-table__variant-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M8.59 16.59L13.17 12L8.59 7.41L10 6l6 6-6 6-1.41-1.41z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </td>
            );
          }

          if (isPhoneColumn) {
            const rawPhoneValue = String(
              row[h] ||
                row["Numero"] ||
                row["Numéro"] ||
                row["Téléphone"] ||
                row["Telephone"] ||
                ""
            );
            const normalizedPhoneForCopy = normalizePhone(
              rawPhoneValue || trimmedDisplayText
            );
            const phoneDisplayText = formatPhoneForDisplay(
              rawPhoneValue || trimmedDisplayText,
              normalizedPhoneForCopy || trimmedDisplayText
            );
            const valueToCopy =
              normalizedPhoneForCopy || trimmedDisplayText || phoneDisplayText;

            if (!trimmedDisplayText) {
              return (
                <td
                  key={h}
                  className="orders-table__cell orders-table__cell--phone"
                >
                  <span className="orders-table__muted">—</span>
                </td>
              );
            }

            const isCopied = copiedKey === copyKey;

            return (
              <td
                key={h}
                className="orders-table__cell orders-table__cell--phone"
              >
                <button
                  type="button"
                  className={`orders-table__phone${
                    isCopied ? " is-copied" : ""
                  }`}
                  onClick={() => handleCopyValue(valueToCopy, copyKey)}
                  title={
                    isCopied ? "Numéro copié" : "Cliquer pour copier le numéro"
                  }
                >
                  <span className="orders-table__phone-number">
                    {phoneDisplayText}
                  </span>
                  <svg
                    className="orders-table__phone-icon"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden="true"
                  >
                    <path
                      d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1Zm1 4H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2
Zm0 14H8V7h9v12Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              </td>
            );
          }

          return (
            <td key={h} className="orders-table__cell">
              {trimmedDisplayText ? (
                trimmedDisplayText
              ) : (
                <span className="orders-table__muted">—</span>
              )}
            </td>
          );
        })}

        <td className="orders-table__cell orders-table__cell--actions">
          <OrderActionButtons
            row={row}
            summary={summary}
            onUpdateStatus={onUpdateStatus}
            onDelivered={onDelivered}
          />
        </td>
        <td className="orders-table__cell orders-table__cell--status">
          <span className="orders-status">
            {(() => {
              const fromSheet = String(
                row["etat"] ?? row["État"] ?? row["Etat"] ?? ""
              ).trim();
              return fromSheet ? fromSheet : "new";
            })()}
          </span>
        </td>
      </tr>
    );
  });

  const [error, setError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState<string>("");
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [timeFilter, setTimeFilter] = React.useState<TimeFilter>("all");
  const [selectedDay, setSelectedDay] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const [selectedOrder, setSelectedOrder] = React.useState<OrderRow | null>(
    null
  );
  const [variantModalOpen, setVariantModalOpen] = React.useState<{
    isOpen: boolean;
    orderRow: OrderRow | null;
    productName: string;
    currentVariant: string;
  }>({
    isOpen: false,
    orderRow: null,
    productName: "",
    currentVariant: "",
  });
  const [availableVariants, setAvailableVariants] = React.useState<Array<{
    name: string;
    quantity: number;
  }>>([]);
  const [loadingVariants, setLoadingVariants] = React.useState(false);

   const getRowIdentifier = React.useCallback((row: OrderRow | null) => {
    if (!row) return null;
    const candidateKeys = [
      "id-sheet",
      "ID",
      "Num commande",
      "Numéro commande",
      "Numero commande",
    ];

    for (const key of candidateKeys) {
      const value = row[key];
      if (value !== undefined && value !== null) {
        const trimmed = String(value).trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }

    return null;
  }, []);

  React.useEffect(() => {
    if (!selectedOrder) return;

    const identifier = getRowIdentifier(selectedOrder);
    if (!identifier) {
      return;
    }

    const updatedRow = rows.find(
      (row) => getRowIdentifier(row) === identifier
    );

    if (!updatedRow || updatedRow === selectedOrder) {
      return;
    }

    setSelectedOrder(updatedRow);
  }, [getRowIdentifier, rows, selectedOrder]);


  const selectedSummary = React.useMemo(
    () => (selectedOrder ? extractOrderSummary(selectedOrder) : null),
    [selectedOrder]
  );

  React.useEffect(() => {
    if (!selectedOrder) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedOrder(null);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
    }

    const body = typeof document !== "undefined" ? document.body : null;
    const previousOverflow = body ? body.style.overflow : "";
    if (body) {
      body.style.overflow = "hidden";
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
      }
      if (body) {
        body.style.overflow = previousOverflow;
      }
    };
  }, [selectedOrder]);

  const availableDayOptions = React.useMemo(() => {
    const daySet = new Set<string>();
    rows.forEach((row) => {
      const date = extractRowDate(row);
      if (!date) return;
      const key = toDateKey(date);
      daySet.add(key);
    });
    return Array.from(daySet).sort((a, b) => (a > b ? -1 : 1));
  }, [rows]);

  React.useEffect(() => {
    if (availableDayOptions.length === 0) {
      if (selectedDay) {
        setSelectedDay("");
      }
      return;
    }
    if (!selectedDay || !availableDayOptions.includes(selectedDay)) {
      setSelectedDay(availableDayOptions[0]);
    }
  }, [availableDayOptions, selectedDay]);

  const selectedReferenceDate = React.useMemo(() => {
    if (!selectedDay) return null;
    const [year, month, day] = selectedDay.split("-").map(Number);
    if ([year, month, day].some((value) => Number.isNaN(value))) return null;
    return new Date(year, (month ?? 1) - 1, day ?? 1);
  }, [selectedDay]);

  const activeTimeRange = React.useMemo(() => {
    if (timeFilter === "all" || !selectedReferenceDate) {
      return null;
    }
    const start = new Date(selectedReferenceDate);
    start.setHours(0, 0, 0, 0);

    if (timeFilter === "day") {
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      end.setMilliseconds(end.getMilliseconds() - 1);
      return { start, end } as const;
    }

    if (timeFilter === "week") {
      const startOfWeek = new Date(start);
      const dayIndex = startOfWeek.getDay();
      const diff = (dayIndex + 6) % 7;
      startOfWeek.setDate(startOfWeek.getDate() - diff);
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);
      endOfWeek.setMilliseconds(endOfWeek.getMilliseconds() - 1);
      return { start: startOfWeek, end: endOfWeek } as const;
    }

    if (timeFilter === "month") {
      const startOfMonth = new Date(start.getFullYear(), start.getMonth(), 1);
      const endOfMonth = new Date(
        start.getFullYear(),
        start.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
      return { start: startOfMonth, end: endOfMonth } as const;
    }

    return null;
  }, [selectedReferenceDate, timeFilter]);

  const statusOptions = React.useMemo(() => {
    const set = new Set<string>();
    rows.forEach((row) => {
      set.add(getRowStatus(row));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const dayOptionFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const dayRangeFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const monthRangeFormatter = React.useMemo(
    () =>
      new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        year: "numeric",
      }),
    []
  );

  const formatDayOptionLabel = React.useCallback(
    (key: string) => {
      const [year, month, day] = key.split("-").map(Number);
      if ([year, month, day].some((value) => Number.isNaN(value))) return key;
      const date = new Date(year, (month ?? 1) - 1, day ?? 1);
      return dayOptionFormatter.format(date);
    },
    [dayOptionFormatter]
  );

  const timeRangeLabel = React.useMemo(() => {
    if (timeFilter === "all") {
      return "Période affichée : toutes les commandes (100 par page)";
    }

    if (!activeTimeRange) {
      return availableDayOptions.length === 0
        ? "Période affichée : aucune date disponible"
        : "Période affichée : sélectionnez une date";
    }

    if (timeFilter === "day") {
      return `Période affichée : ${dayRangeFormatter.format(
        activeTimeRange.start
      )}`;
    }

    if (timeFilter === "week") {
      return `Période affichée : du ${dayRangeFormatter.format(
        activeTimeRange.start
      )} au ${dayRangeFormatter.format(activeTimeRange.end)}`;
    }

    if (timeFilter === "month") {
      return `Période affichée : ${monthRangeFormatter.format(
        activeTimeRange.start
      )}`;
    }

    return "";
  }, [
    timeFilter,
    activeTimeRange,
    availableDayOptions.length,
    dayRangeFormatter,
    monthRangeFormatter,
  ]);

  const statusFilterLabel = React.useMemo(() => {
    if (statusFilter === "all") return "";
    return `Statut filtré : ${statusFilter}`;
  }, [statusFilter]);

  const isFirstLoadRef = React.useRef(true);
  const cancelledRef = React.useRef(false);
  const fetchingRef = React.useRef(false);
  const disableStatusSync = React.useCallback((reason?: unknown) => {
    if (!syncDisabledRef.current) {
      syncDisabledRef.current = true;
      setStatusSyncDisabled(true);
      if (reason) {
        console.warn(
          "Désactivation de la synchronisation du statut (backend injoignable)",
          reason
        );
      }
    }
  }, []);

  const syncStatus = React.useCallback(
    async (
      rowId: string,
      status: SheetStatus,
      context?: UpdateStatusContext
    ) => {
      if (syncDisabledRef.current) {
        return Promise.resolve();
      }
      if (syncDisabledRef.current) {
        return;
      }
      if (!rowId) {
        throw new Error(
          "Identifiant de commande manquant pour la mise à jour du statut"
        );
      }
      try {
        const res = await fetch(SHEET_SYNC_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rowId,
            status,
            tracking: context?.tracking,
            row: context?.row,
          }),
        });
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        if (!res.ok) {
          const message = typeof data === "string" ? data : data?.message;
          throw new Error(message || `HTTP ${res.status}`);
        }
        return data;
      } catch (error) {
        console.error(
          "Erreur lors de la synchronisation du statut avec le Sheet",
          error
        );
        if (isNetworkError(error)) {
          disableStatusSync(error);
          return;
        }
        throw error;
      }
    },
    [disableStatusSync]
  );

  const loadSheetData = React.useCallback(async (withSpinner = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    const shouldShowSpinner = withSpinner || isFirstLoadRef.current;

    if (shouldShowSpinner) {
      setLoading(true);
    }
    setError(null);

    try {
      const res = await fetch(buildCsvUrl(), { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const grid = parseCsv(text);
      if (grid.length === 0) {
        throw new Error("CSV vide");
      }
      const [rawHeaderRow, ...dataRows] = grid;
      const headerRow = rawHeaderRow.map((cell) =>
        typeof cell === "string" ? cell.trim() : String(cell ?? "")
      );

      if (!cancelledRef.current) {
        const normalizeHeader = (h: string) =>
          (h || "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        const hiddenHeaderSet = new Set([
          "date",
          "adresse",
          "total",
          "net a payer",
          "commune",
        ]);

        const originalHeaderByNormalized = new Map<string, string>();
        headerRow.forEach((h) => {
          const normalized = normalizeHeader(h || "");
          if (!normalized) return;
          if (!originalHeaderByNormalized.has(normalized)) {
            originalHeaderByNormalized.set(normalized, h);
          }
        });

        const cleanedHeaders = headerRow.filter((h) => {
          const normalized = normalizeHeader(h || "");
          if (!normalized) return false;
          if (normalized === "etat") return false;
          if (hiddenHeaderSet.has(normalized)) return false;
          return true;
        });

        const uniqueHeaders: string[] = [];
        const seenHeaders = new Set<string>();
        cleanedHeaders.forEach((h) => {
          const normalized = normalizeHeader(h || "");
          if (!normalized || seenHeaders.has(normalized)) {
            return;
          }
          seenHeaders.add(normalized);
          uniqueHeaders.push(h);
        });

        const ensureHeader = (label: string) => {
          const normalized = normalizeHeader(label);
          if (!normalized || seenHeaders.has(normalized)) {
            return;
          }
          const original = originalHeaderByNormalized.get(normalized);
          uniqueHeaders.push(original ?? label);
          seenHeaders.add(normalized);
        };
        ["Nom du client", "Numero", "ID", "id-sheet"].forEach(ensureHeader);

        const desiredOrder = ["Nom du client", "Numero", "ID", "id-sheet"];
        const prioritized = desiredOrder
          .map((label) => {
            const normalized = normalizeHeader(label);
            return uniqueHeaders.find((h) => normalizeHeader(h) === normalized);
          })
          .filter((h): h is string => Boolean(h));
        const prioritizedSet = new Set(
          prioritized.map((h) => normalizeHeader(h))
        );
        const remaining = uniqueHeaders.filter(
          (h) => !prioritizedSet.has(normalizeHeader(h))
        );

        setHeaders([...prioritized, ...remaining]);
        const mapped = dataRows
          .map((r, dataIndex) => {
            if (!r.some((cell) => cell && cell.trim() !== "")) {
              return null;
            }
            const obj: OrderRow = {};
            headerRow.forEach((h, idx) => {
              const headerKey = typeof h === "string" ? h.trim() : "";
              if (!headerKey) return;
              obj[headerKey] = r[idx] ?? "";
            });

            const idKey = Object.keys(obj).find(
              (key) => key.trim().toLowerCase() === "id"
            );
            const existingIdRaw = idKey ? obj[idKey] : undefined;
            const normalizedId =
              typeof existingIdRaw === "string"
                ? existingIdRaw.trim()
                : existingIdRaw !== undefined && existingIdRaw !== null
                ? String(existingIdRaw).trim()
                : "";
            const sheetRowNumber = dataIndex + 2; // +2 pour inclure la ligne d'en-tête
            obj["id-sheet"] = String(sheetRowNumber);
            if (normalizedId) {
              obj["ID"] = normalizedId;
            } else {
              obj["ID"] = String(sheetRowNumber);
            }
            if (idKey && idKey !== "ID") {
              delete obj[idKey];
            }

            const sheetStatus = String(
              obj["etat"] ?? obj["État"] ?? obj["Etat"] ?? ""
            ).trim();

            obj["etat"] = sheetStatus;
            const assignCanonicalValue = (targetKey: string, raw: unknown) => {
              const value = String(raw ?? "").trim();
              if (!value) return false;
              obj[targetKey] = value;
              const normalizedTargetKey = normalizeFieldKey(targetKey);
              if (normalizedTargetKey) {
                for (const key of Object.keys(obj)) {
                  if (key === targetKey) continue;
                  if (normalizeFieldKey(key) === normalizedTargetKey) {
                    obj[key] = value;
                  }
                }
              }
              return true;
            };

            const ensureCanonicalField = (
              targetKey: string,
              matcher: (normalizedKey: string, tokens: string[]) => boolean
            ) => {
              const existing = obj[targetKey];
              if (assignCanonicalValue(targetKey, existing)) {
                return;
              }
              for (const key of Object.keys(obj)) {
                const rawValue = obj[key];
                if (rawValue === undefined || rawValue === null) continue;
                const normalizedKey = normalizeFieldKey(key);
                if (!normalizedKey) continue;
                const tokens = normalizedKey
                  .replace(/[^a-z0-9]+/g, " ")
                  .trim()
                  .split(/\s+/)
                  .filter(Boolean);
                if (!matcher(normalizedKey, tokens)) continue;
                if (assignCanonicalValue(targetKey, rawValue)) {
                  return;
                }
              }
            };

            ensureCanonicalField("Nom du client", (normalizedKey, tokens) => {
              const hasClient = tokens.some(
                (token) => token === "client" || token === "customer"
              );
              const hasName = tokens.some(
                (token) => token === "nom" || token === "name"
              );
              if (hasClient && hasName) return true;
              return (
                normalizedKey.includes("client") &&
                (normalizedKey.includes("nom") ||
                  normalizedKey.includes("name"))
              );
            });

            ensureCanonicalField("Numero", (normalizedKey, tokens) => {
              if (tokens.some((token) => token === "numero")) return true;
              if (
                tokens.some(
                  (token) =>
                    token === "telephone" ||
                    token === "tel" ||
                    token === "phone"
                )
              )
                return true;
              return (
                normalizedKey.includes("numero") ||
                normalizedKey.includes("telephone") ||
                normalizedKey.includes("tel") ||
                normalizedKey.includes("phone")
              );
            });

            return obj;
          })
          .filter((row): row is OrderRow => row !== null);
        setRows(mapped);
      }
    } catch (e: any) {
      if (!cancelledRef.current) setError(e?.message || "Erreur inconnue");
    } finally {
      if (!cancelledRef.current && shouldShowSpinner) {
        setLoading(false);
      }
      fetchingRef.current = false;
      if (!cancelledRef.current) {
        isFirstLoadRef.current = false;
      }
    }
  }, []);

  React.useEffect(() => {
    cancelledRef.current = false;

    let intervalId: ReturnType<typeof setInterval> | undefined;

    const initialise = async () => {
      await loadSheetData(true);
      intervalId = setInterval(() => {
        loadSheetData(false);
      }, 10000);
    };

    initialise();

    return () => {
      cancelledRef.current = true;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [loadSheetData]);

  const handleUpdateRowStatus = useCallback(
    async (
      rowId: string,
      status: SheetStatus,
      context: UpdateStatusContext = {}
    ) => {
      if (!rowId) {
        throw new Error("Identifiant de commande manquant");
      }

      let recordedPrevious: SheetStatus | undefined;
      const matchesRow = (candidate: OrderRow) => {
        const candidateSheetId = String(candidate["id-sheet"] ?? "").trim();
        if (candidateSheetId) {
          return candidateSheetId === rowId;
        }
        const candidateFallbackId = String(candidate["ID"] ?? "").trim();
        return candidateFallbackId === rowId;
      };

      setRows((prevRows) =>
        prevRows.map((r) => {
          if (matchesRow(r)) {
            recordedPrevious = (String(r["etat"] ?? "") ||
              "new") as SheetStatus;
            return { ...r, etat: status };
          }
          return r;
        })
      );

      const fallbackStatus: SheetStatus =
        (context.previousStatus as SheetStatus) ?? recordedPrevious ?? "new";

      try {
        await syncStatus(rowId, status, context);
      } catch (error) {
        setRows((prevRows) =>
          prevRows.map((r) =>
            matchesRow(r) ? { ...r, etat: fallbackStatus } : r
          )
        );
        throw error;
      }
    },
    [syncStatus]
  );

  const handleDelivered = useCallback(
    async (
      payload: {
        code?: string;
        name?: string;
        variant: string;
        quantity: number;
      },
      rowId: string
    ) => {
      // Appelle l'API backend pour décrémenter le stock (permet stock 0)
      try {
        const res = await fetch("/api/products/decrement-bulk-allow-zero", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ items: [payload] }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || "Échec décrémentation");
        const failures = Array.isArray(data?.results)
          ? data.results.filter((r: any) => !r.ok)
          : [];
        if (failures.length) {
          const msg = failures
            .map(
              (f: any) => `${f.name || f.code || ""} / ${f.variant}: ${f.error}`
            )
            .join("\n");
          throw new Error(msg || "Échec partiel");
        }
        
        // Vérifier si le stock final est à 0 et afficher un avertissement
        const results = Array.isArray(data?.results) ? data.results : [];
        const zeroStockItems = results.filter((r: any) => r.ok && r.finalStock === 0);
        if (zeroStockItems.length > 0) {
          const zeroStockNames = zeroStockItems
            .map((item: any) => `${item.name || item.code || ""} (${item.variant})`)
            .join(", ");
          
          // Afficher un toast d'avertissement pour le stock à 0
          const toast = document.createElement("div");
          toast.textContent = `⚠️ Stock épuisé pour: ${zeroStockNames}`;
          Object.assign(toast.style, {
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(245,158,11,0.3)",
            fontSize: "0.9rem",
            fontWeight: "600",
            zIndex: "2000",
            opacity: "0",
            transition: "opacity 0.3s ease",
          });
          document.body.appendChild(toast);
          setTimeout(() => (toast.style.opacity = "1"), 50);
          setTimeout(() => {
            toast.style.opacity = "0";
            setTimeout(() => toast.remove(), 400);
          }, 5000);
        }
      } catch (e) {
        throw e;
      }
    },
    [token]
  );

  const handleVariantClick = useCallback(async (row: OrderRow) => {
    const productName = String(row["Produit"] || "").trim();
    const currentVariant = String(
      row["Variante"] || row["Variation"] || row["Taille"] || "default"
    ).trim();

    if (!productName) {
      alert("Aucun produit trouvé pour cette commande");
      return;
    }

    setVariantModalOpen({
      isOpen: true,
      orderRow: row,
      productName,
      currentVariant,
    });

    // Charger les variantes disponibles
    setLoadingVariants(true);
    try {
      const res = await fetch("/api/products", {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const products = await res.json();
      
      // Trouver le produit correspondant
      const product = products.find((p: any) => 
        p.name.toLowerCase().trim() === productName.toLowerCase().trim()
      );
      
      if (product && product.variants) {
        setAvailableVariants(product.variants);
      } else {
        setAvailableVariants([]);
        alert("Aucune variante trouvée pour ce produit");
      }
    } catch (error) {
      console.error("Erreur lors du chargement des variantes:", error);
      alert("Erreur lors du chargement des variantes");
      setAvailableVariants([]);
    } finally {
      setLoadingVariants(false);
    }
  }, [token]);

  const handleVariantSelect = useCallback(async (selectedVariant: string) => {
    if (!variantModalOpen.orderRow) return;

    const row = variantModalOpen.orderRow;
    const rowId = String(row["id-sheet"] || row["ID"] || "").trim();
    
    if (!rowId) {
      alert("Impossible d'identifier la commande");
      return;
    }

    try {
      // Mettre à jour la variante dans le Google Sheet
      await syncStatus(rowId, getRowStatus(row), {
        previousStatus: getRowStatus(row),
        row: { ...row, Variante: selectedVariant },
      });

      // Mettre à jour l'état local
      setRows((prevRows) =>
        prevRows.map((r) => {
          const currentRowId = String(r["id-sheet"] || r["ID"] || "").trim();
          if (currentRowId === rowId) {
            return { ...r, Variante: selectedVariant };
          }
          return r;
        })
      );

      // Fermer le modal
      setVariantModalOpen({
        isOpen: false,
        orderRow: null,
        productName: "",
        currentVariant: "",
      });

      // Afficher un message de succès
      const toast = document.createElement("div");
      toast.textContent = `✅ Variante mise à jour vers "${selectedVariant}"`;
      Object.assign(toast.style, {
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
        color: "#fff",
        padding: "12px 18px",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(34,197,94,0.3)",
        fontSize: "0.9rem",
        fontWeight: "600",
        zIndex: "2000",
        opacity: "0",
        transition: "opacity 0.3s ease",
      });
      document.body.appendChild(toast);
      setTimeout(() => (toast.style.opacity = "1"), 50);
      setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 400);
      }, 3000);

    } catch (error) {
      console.error("Erreur lors de la mise à jour de la variante:", error);
      alert("Erreur lors de la mise à jour de la variante");
    }
  }, [variantModalOpen.orderRow, syncStatus]);

  const searchableHeaders = React.useMemo(() => {
    const keys: string[] = [];
    const pushKey = (key: string) => {
      if (!key) return;
      if (keys.includes(key)) return;
      keys.push(key);
    };
    ["Nom du client", "Numero"].forEach(pushKey);
    headers.forEach(pushKey);
    ["Wilaya", "Commune", "ID", "id-sheet", "Type de livraison"].forEach(
      pushKey
    );
    return keys;
  }, [headers]);

  const filtered = React.useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const normalizedStatus = statusFilter.trim().toLowerCase();

    return rows.filter((row) => {
      if (trimmedQuery) {
        const matchesQuery = searchableHeaders
          .filter((k) => k in row)
          .some((key) => (row[key] || "").toLowerCase().includes(trimmedQuery));
        if (!matchesQuery) {
          return false;
        }
      }

      if (statusFilter !== "all") {
        const rowStatus = getRowStatus(row).toLowerCase();
        if (rowStatus !== normalizedStatus) {
          return false;
        }
      }

      if (timeFilter !== "all") {
        if (!activeTimeRange) {
          return false;
        }
        const rowDate = extractRowDate(row);
        if (!rowDate) {
          return false;
        }
        const timestamp = rowDate.getTime();
        if (
          timestamp < activeTimeRange.start.getTime() ||
          timestamp > activeTimeRange.end.getTime()
        ) {
          return false;
        }
      }

      return true;
    });
  }, [
    rows,
    query,
    searchableHeaders,
    statusFilter,
    timeFilter,
    activeTimeRange,
  ]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [timeFilter, selectedDay, statusFilter]);

  React.useEffect(() => {
    setCurrentPage((prev) => {
      const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      return Math.min(prev, maxPage);
    });
  }, [filtered.length]);

  const totalPages = React.useMemo(
    () => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    [filtered.length]
  );

  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedRows = React.useMemo(() => {
    const start = (safeCurrentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safeCurrentPage]);

  const pageRangeStart =
    filtered.length === 0 ? 0 : (safeCurrentPage - 1) * PAGE_SIZE + 1;
  const pageRangeEnd = Math.min(
    filtered.length,
    (safeCurrentPage - 1) * PAGE_SIZE + paginatedRows.length
  );

  return (
    <div className="orders-page">
      <div className="orders-page__header">
        <h1 className="orders-page__title">Commandes</h1>
        <p className="orders-page__subtitle">
          Suivi centralisé des commandes importées depuis Google Sheets pour
          l’équipe admin et confirmation.
        </p>
      </div>

      <div className="orders-panel">
        <div className="orders-toolbar">
          <div className="orders-toolbar__row">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (client, wilaya, produit, …)"
              className="orders-input"
            />
            <a
              href={`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`}
              target="_blank"
              rel="noreferrer"
              className="orders-link"
            >
              Ouvrir la feuille Google
            </a>
          </div>

          <div className="orders-toolbar__row orders-toolbar__row--filters">
            <span className="orders-filter-label">Filtrer par période :</span>
            {TIME_FILTER_OPTIONS.map((option) => {
              const isActive = option.value === timeFilter;
              return (
                <button
                  key={option.value}
                  onClick={() => setTimeFilter(option.value)}
                  type="button"
                  className={`orders-chip${isActive ? " is-active" : ""}`}
                >
                  {option.label}
                </button>
              );
            })}

            {timeFilter !== "all" && (
              <select
                value={availableDayOptions.length === 0 ? "" : selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                disabled={availableDayOptions.length === 0}
                className="orders-select"
              >
                {availableDayOptions.length === 0 ? (
                  <option value="">Aucune date disponible</option>
                ) : (
                  availableDayOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatDayOptionLabel(option)}
                    </option>
                  ))
                )}
              </select>
            )}

            <span className="orders-filter-label orders-filter-label--status">
              Statut :
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="orders-select"
            >
              <option value="all">Tous les statuts</option>
              {statusOptions.map((option) => (
                <option key={option || "status-empty"} value={option}>
                  {option || "Sans statut"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {statusSyncDisabled && (
          <div className="orders-alert" role="status">
            <strong>Synchronisation désactivée.</strong> Impossible de contacter
            le service backend (<code>{SHEET_SYNC_ENDPOINT}</code>). Les
            changements locaux ne seront pas envoyés.
          </div>
        )}

        {loading && (
          <p className="orders-state orders-state--loading">Chargement…</p>
        )}
        {error && (
          <p className="orders-state orders-state--error">Erreur : {error}</p>
        )}

        {!loading && !error && (
          <>
            <div className="orders-mobile-list">
              {paginatedRows.map((row, idx) => {
                const summary = extractOrderSummary(row);
                const displayName =
                  summary.rawName || summary.name || "Sans nom";
                const statusLabel = summary.status || "Sans statut";
                const phoneHref = summary.phoneDial
                  ? `tel:${summary.phoneDial}`
                  : summary.displayPhone
                  ? `tel:${summary.displayPhone.replace(/\s+/g, "")}`
                  : "";
                return (
                  <button
                    type="button"
                    key={row["id-sheet"] || row["ID"] || idx}
                    className="orders-mobile-card"
                    onClick={() => setSelectedOrder(row)}
                    aria-label={`Voir la commande de ${displayName}`}
                  >
                    <div className="orders-mobile-card__header">
                      <div className="orders-mobile-card__title">
                        <span className="orders-mobile-card__name">
                          {displayName}
                        </span>
                        {summary.displayRowLabel && (
                          <span className="orders-mobile-card__reference">
                            #{summary.displayRowLabel}
                          </span>
                        )}
                      </div>
                      <span className="orders-status">{statusLabel}</span>
                    </div>
                    <div className="orders-mobile-card__contact">
                      {summary.displayPhone ? (
                        <a
                          href={phoneHref}
                          onClick={(event) => event.stopPropagation()}
                          className="orders-mobile-card__phone"
                        >
                          {summary.displayPhone}
                        </a>
                      ) : (
                        <span className="orders-mobile-card__phone orders-mobile-card__phone--disabled">
                          Aucun numéro
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="orders-mobile-empty">
                  Aucune commande trouvée.
                </div>
              )}
            </div>

            <div className="orders-table-wrapper">
              <table className="orders-table">
                <thead>
                  <tr>
                    {headers.map((h) => (
                      <th key={h} className="orders-table__header">
                        {h}
                      </th>
                    ))}

                    <th className="orders-table__header">Action</th>
                    <th className="orders-table__header">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, idx) => (
                    <OrderRowItem
                      key={row["id-sheet"] || row["ID"] || idx}
                      row={row}
                      idx={idx}
                      headers={headers}
                      onUpdateStatus={handleUpdateRowStatus}
                      onDelivered={handleDelivered}
                      onVariantClick={handleVariantClick}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr className="orders-row orders-row--empty">
                      <td
                        className="orders-table__cell"
                        colSpan={headers.length + 2}
                      >
                        Aucune commande trouvée.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {filtered.length > 0 && (
          <div className="orders-pagination">
            <div className="orders-pagination__details">
              <span>
                Affichage des commandes {pageRangeStart} à {pageRangeEnd} sur{" "}
                {filtered.length}
              </span>
              {timeRangeLabel && <span>{timeRangeLabel}</span>}
              {statusFilterLabel && <span>{statusFilterLabel}</span>}
            </div>

            <div className="orders-pagination__controls">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                disabled={safeCurrentPage <= 1}
                className="orders-button orders-button--ghost"
              >
                Précédent
              </button>
              <span className="orders-pagination__page">
                Page {safeCurrentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((page) => Math.min(page + 1, totalPages))
                }
                disabled={safeCurrentPage >= totalPages}
                className="orders-button orders-button--ghost"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedOrder && selectedSummary && (
        <div
          className="orders-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="orders-modal-title"
        >
          <div
            className="orders-modal__backdrop"
            onClick={() => setSelectedOrder(null)}
            aria-hidden="true"
          />
          <div className="orders-modal__content" role="document">
            <button
              type="button"
              className="orders-modal__close"
              onClick={() => setSelectedOrder(null)}
              aria-label="Fermer"
            >
              ×
            </button>

            <h2 id="orders-modal-title" className="orders-modal__title">
              {selectedSummary.rawName || selectedSummary.name || "Commande"}
            </h2>
            {selectedSummary.displayRowLabel && (
              <p className="orders-modal__reference">
                Référence : {selectedSummary.displayRowLabel}
              </p>
            )}

            <div className="orders-modal__summary">
              {selectedSummary.displayPhone ? (
                <a
                  href={
                    selectedSummary.phoneDial
                      ? `tel:${selectedSummary.phoneDial}`
                      : `tel:${selectedSummary.displayPhone.replace(
                          /\s+/g,
                          ""
                        )}`
                  }
                  className="orders-modal__phone"
                >
                  Appeler {selectedSummary.displayPhone}
                </a>
              ) : (
                <span className="orders-modal__phone orders-modal__phone--disabled">
                  Aucun numéro disponible
                </span>
              )}
              <span className="orders-status">
                {selectedSummary.status || "Sans statut"}
              </span>
            </div>

            <OrderActionButtons
              row={selectedOrder}
              summary={selectedSummary}
              onUpdateStatus={handleUpdateRowStatus}
              onDelivered={handleDelivered}
              variant="modal"
            />

            <div className="orders-modal__details">
              {headers.map((header, index) => {
                const key = `${header || "col"}-${index}`;
                const trimmedHeader = header ? header.trim() : "";
                const normalizedHeader = trimmedHeader
                  ? normalizeFieldKey(trimmedHeader)
                  : "";
                let value = selectedOrder[header];
                if (
                  value === undefined &&
                  trimmedHeader &&
                  header !== trimmedHeader
                ) {
                  value = selectedOrder[trimmedHeader];
                }
                if (value === undefined && normalizedHeader) {
                  const matchedKey = Object.keys(selectedOrder).find(
                    (candidate) =>
                      normalizeFieldKey(candidate || "") === normalizedHeader
                  );
                  if (matchedKey) {
                    value = selectedOrder[matchedKey];
                  }
                }

                const displayValue = (value ?? "").toString().trim();
                return (
                  <div key={key} className="orders-modal__detail">
                    <span className="orders-modal__detail-label">
                      {header || "Sans titre"}
                    </span>
                    <span className="orders-modal__detail-value">
                      {displayValue ? (
                        displayValue
                      ) : (
                        <span className="orders-table__muted">—</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal de sélection de variante */}
      {variantModalOpen.isOpen && (
        <div
          className="orders-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="variant-modal-title"
        >
          <div
            className="orders-modal__backdrop"
            onClick={() => setVariantModalOpen({
              isOpen: false,
              orderRow: null,
              productName: "",
              currentVariant: "",
            })}
            aria-hidden="true"
          />
          <div className="orders-modal__content" role="document">
            <button
              type="button"
              className="orders-modal__close"
              onClick={() => setVariantModalOpen({
                isOpen: false,
                orderRow: null,
                productName: "",
                currentVariant: "",
              })}
              aria-label="Fermer"
            >
              ×
            </button>

            <h2 id="variant-modal-title" className="orders-modal__title">
              Changer la variante
            </h2>
            <p className="orders-modal__reference">
              Produit : {variantModalOpen.productName}
            </p>
            <p className="orders-modal__reference">
              Variante actuelle : {variantModalOpen.currentVariant}
            </p>

            <div className="orders-modal__variants">
              {loadingVariants ? (
                <div className="orders-modal__loading">
                  Chargement des variantes...
                </div>
              ) : availableVariants.length === 0 ? (
                <div className="orders-modal__empty">
                  Aucune variante disponible pour ce produit
                </div>
              ) : (
                <div className="orders-modal__variants-list">
                  {availableVariants.map((variant, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`orders-modal__variant-item ${
                        variant.name === variantModalOpen.currentVariant
                          ? "is-current"
                          : ""
                      }`}
                      onClick={() => handleVariantSelect(variant.name)}
                      disabled={variant.name === variantModalOpen.currentVariant}
                    >
                      <div className="orders-modal__variant-info">
                        <span className="orders-modal__variant-name">
                          {variant.name}
                        </span>
                        <span className={`orders-modal__variant-stock ${
                          variant.quantity === 0 ? "is-zero" : ""
                        }`}>
                          Stock: {variant.quantity}
                        </span>
                      </div>
                      {variant.name === variantModalOpen.currentVariant && (
                        <span className="orders-modal__variant-current">
                          Actuelle
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Revenir en haut de la page"
        className="orders-scroll-top"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M12 5l-7 7h4v7h6v-7h4l-7-7z" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
};

export default Orders;
