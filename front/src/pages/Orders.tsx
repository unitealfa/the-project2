import React, { useState, useMemo, useCallback, useContext, useLayoutEffect } from "react";
import { AuthContext } from "../context/AuthContext";
import DeliverySelection from "../components/DeliverySelection";
import DeliveryCell from "../components/DeliveryCell";
import { apiFetch } from "../utils/api";
import { getFrenchForDisplay, getFrenchWilaya, resolveCommuneName, getCommunesByWilaya, getWilayaIdByCommune } from "../utils/communes";
import CommuneCorrectionModal from "../components/CommuneCorrectionModal";
import SearchableSelect from "../components/SearchableSelect";
import CommuneSelectionModal from "../components/CommuneSelectionModal";
import {
  parseSheetDateValue,
  extractRowDate,
  EXCEL_EPOCH,
  toDateKey,
} from "../utils/dateHelpers";
import { parseLocaleAmount, parsePositiveIntegerQuantity } from "../utils/numberParsing";
import "../styles/Orders.css";

const DEBUG_ORDERS = false;
const debugLog = (event: string, ..._details: unknown[]) => {
  if (!DEBUG_ORDERS) return;
  if (typeof console !== "undefined") {
    console.log("[ORDERS DEBUG]", event);
  }
};
const getScrollSnapshot = () => {
  if (typeof window === "undefined") {
    return { top: 0, left: 0, viewportH: 0, viewportW: 0 };
  }
  return {
    top:
      window.scrollY ||
      (typeof document !== "undefined"
        ? document.documentElement.scrollTop
        : 0),
    left:
      window.scrollX ||
      (typeof document !== "undefined"
        ? document.documentElement.scrollLeft
        : 0),
    viewportH: window.innerHeight,
    viewportW: window.innerWidth,
  };
};

// Scroll keep/restore helpers removed to let browser handle scroll naturally.

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

const firstNonEmptyRowValue = (
  row: OrderRow,
  candidates: string[]
): string => {
  for (const key of candidates) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  return "";
};

const readBooleanRowFlag = (row: OrderRow, candidates: string[]): 0 | 1 => {
  const value = normalizeTextValue(firstNonEmptyRowValue(row, candidates));
  return ["1", "true", "oui", "yes", "fragile"].includes(value) ? 1 : 0;
};

const configuredSheetEditUrl = String(
  import.meta.env.VITE_SHEET_EDIT_URL ?? ""
).trim();
const SHEET_EDIT_URL = /^https:\/\/docs\.google\.com\/spreadsheets\//i.test(
  configuredSheetEditUrl
)
  ? configuredSheetEditUrl
  : "";
const buildCsvUrl = () => `/api/orders/sheet?cacheBust=${Date.now()}`;

const VARIANT_KEY_CANDIDATES = [
  "Variante",
  "Variation",
  "Taille",
  "Variante produit",
  "Variant",
];

const normalizeKey = (key: string) => key.trim().toLowerCase();

const normalizeTextValue = (value: string | null | undefined): string => {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};

const normalizeProductNameForCache = (value: string | null | undefined) =>
  normalizeTextValue(value);

const normalizeProductCodeForCache = (value: string | null | undefined) =>
  value ? value.trim().toLowerCase() : "";

const normalizeVariantNameForCache = (value: string | null | undefined) =>
  normalizeTextValue(value);

const DEFAULT_VARIANT_NORMALIZED = new Set([
  "default",
  "defaut",
  "sans variante",
  "aucune",
  "aucun",
  "aucune variante",
  "standard",
  "n/a",
  "na",
]);

const isMeaningfulVariantName = (value: string) =>
  !DEFAULT_VARIANT_NORMALIZED.has(normalizeVariantNameForCache(value));

const buildProductCacheKeys = (
  code?: string | null,
  name?: string | null
): string[] => {
  const keys: string[] = [];
  const normalizedCode = normalizeProductCodeForCache(code);
  if (normalizedCode) {
    keys.push(`code:${normalizedCode}`);
  }
  const normalizedName = normalizeProductNameForCache(name);
  if (normalizedName) {
    keys.push(`name:${normalizedName}`);
  }
  return keys;
};

const VARIANT_KEY_CANDIDATE_SET = new Set(
  VARIANT_KEY_CANDIDATES.map((candidate) => normalizeKey(candidate))
);

const PRODUCT_KEY_KEYWORDS = ["produit", "product", "article"];

const extractProductLabel = (row: OrderRow): string => {
  for (const [rawKey, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(rawKey);
    if (!normalizedKey) continue;
    if (
      PRODUCT_KEY_KEYWORDS.some((keyword) => normalizedKey.includes(keyword))
    ) {
      const trimmed = String(value ?? "").trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return "";
};

const splitProductLabel = (
  label: string
): { baseName: string; variant: string | null } => {
  const trimmed = label.trim();
  if (!trimmed) {
    return { baseName: "", variant: null };
  }

  const cleanupBaseName = (value: string) =>
    value.replace(/[-–—:|]+\s*$/, "").trim();
  const sanitizeVariant = (value: string) =>
    value
      .replace(/^[\s-–—:|\[\]]+/, "")
      .replace(/[\s\[\]]+$/, "")
      .replace(/\s+/g, " ")
      .trim();

  const trySlashSeparated = () => {
    const slashParts = trimmed
      .split(/[\/]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    if (slashParts.length >= 2) {
      const variant = sanitizeVariant(slashParts[slashParts.length - 1]);
      const baseName = cleanupBaseName(slashParts.slice(0, -1).join(" / "));
      if (variant) {
        return {
          baseName: baseName || trimmed,
          variant,
        };
      }
    }

    return null;
  };

  const parenthesisMatch = trimmed.match(/\(([^()]+)\)\s*$/);
  if (parenthesisMatch && typeof parenthesisMatch.index === "number") {
    const variant = sanitizeVariant(parenthesisMatch[1]);
    const baseName = cleanupBaseName(trimmed.slice(0, parenthesisMatch.index));
    if (variant) {
      return {
        baseName: baseName || trimmed,
        variant,
      };
    }
  }

  const bracketMatch = trimmed.match(/\[([^\[\]]+)\]\s*$/);
  if (bracketMatch && typeof bracketMatch.index === "number") {
    const variant = sanitizeVariant(bracketMatch[1]);
    const baseName = cleanupBaseName(trimmed.slice(0, bracketMatch.index));
    if (variant) {
      return {
        baseName: baseName || trimmed,
        variant,
      };
    }
  }
  const slashSeparatedResult = trySlashSeparated();
  if (slashSeparatedResult) {
    return slashSeparatedResult;
  }

  const separators = [" - ", " – ", " — ", " : ", " | "];
  for (const separator of separators) {
    const index = trimmed.lastIndexOf(separator);
    if (index > 0 && index < trimmed.length - separator.length) {
      const variant = sanitizeVariant(trimmed.slice(index + separator.length));
      const baseName = cleanupBaseName(trimmed.slice(0, index));
      if (variant) {
        return {
          baseName: baseName || trimmed,
          variant,
        };
      }
    }
  }

  const looseMatch = trimmed.match(/^(.*?)[\s]*[-–—:|]\s*([^\s].*)$/);
  if (looseMatch) {
    const baseName = cleanupBaseName(looseMatch[1]);
    const variant = sanitizeVariant(looseMatch[2]);
    if (baseName && variant) {
      return {
        baseName,
        variant,
      };
    }
  }

  return { baseName: trimmed, variant: null };
};

const extractVariantValue = (row: OrderRow): string => {
  let defaultLikeVariant: string | null = null;
  for (const [rawKey, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(rawKey);
    if (VARIANT_KEY_CANDIDATE_SET.has(normalizedKey)) {
      const trimmed = String(value ?? "").trim();
      if (!trimmed) {
        continue;
      }
      if (isMeaningfulVariantName(trimmed)) {
        return trimmed;
      }
      defaultLikeVariant = defaultLikeVariant ?? "default";
    }
  }

  const productLabel = extractProductLabel(row);
  if (productLabel) {
    const { variant } = splitProductLabel(productLabel);
    if (variant) {
      if (isMeaningfulVariantName(variant)) {
        return variant;
      }
      defaultLikeVariant = defaultLikeVariant ?? "default";
    }
  }
  return defaultLikeVariant ?? "default";
};

/**
 * Extrait le nom du produit sans variante depuis une ligne de commande
 */
const extractProductNameOnly = (row: OrderRow): string => {
  const productLabel = extractProductLabel(row);
  if (!productLabel) {
    return "";
  }
  const { baseName } = splitProductLabel(productLabel);
  return baseName || productLabel;
};

const extractQuantityValue = (row: OrderRow): number => {
  return parsePositiveIntegerQuantity(
    row["Quantité"] || row["Quantite"] || row["Qte"]
  ) ?? 1;
};

const extractProductCode = (row: OrderRow): string => {
  const candidates = ["Code", "code", "SKU", "Sku"];
  for (const key of candidates) {
    if (key in row) {
      const trimmed = String(row[key] ?? "").trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return "";
};

const extractReference = (row: OrderRow): string => {
  const directCandidates = ["Référence", "Reference", "REF", "Ref"];
  for (const key of directCandidates) {
    const value = String(row[key] ?? "").trim();
    if (value) return value;
  }
  for (const [key, rawValue] of Object.entries(row)) {
    const normalizedKey = normalizeFieldKey(key);
    if (
      normalizedKey === "reference" ||
      normalizedKey === "ref" ||
      normalizedKey.includes("commande_reference") ||
      normalizedKey.includes("reference_commande")
    ) {
      const value = String(rawValue ?? "").trim();
      if (value) return value;
    }
  }
  return "";
};

type UpdateStatusContext = {
  previousStatus?: string;
  row?: OrderRow;
  tracking?: string;
  deliveryType?: DeliveryType;
  deliveryPersonId?: string;
  persist?: boolean;
};

type SheetStatus =
  | "new"
  | "abandoned"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "returned"
  | string;

const SHEET_SYNC_ENDPOINT = "/api/orders/status";

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

const getRowStatus = (row: OrderRow): string => {
  const rawStatus = row["etat"] ?? row["État"] ?? row["Etat"];
  const status =
    typeof rawStatus === "string"
      ? rawStatus.trim()
      : String(rawStatus ?? "").trim();
  return status || "new";
};

const getDisplayedOrderStatus = (row: OrderRow): string => {
  const businessStatus = getRowStatus(row);
  const carrierStatus = String(row["__carrierStatus"] ?? "").trim();
  if (!carrierStatus) return businessStatus;
  const readableCarrierStatus = carrierStatus.replace(/_/g, " ");
  return readableCarrierStatus === businessStatus
    ? readableCarrierStatus
    : `${readableCarrierStatus} · ${businessStatus}`;
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

type DeliveryApiType = "api_dhd" | "api_sook";
type DeliveryType = DeliveryApiType | "livreur";

const normalizeFieldKey = (key: string) =>
  key
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const normalizeHeaderKey = (value: string) =>
  normalizeFieldKey(value).replace(/[^a-z0-9]+/g, "");

type CustomerDeliveryMode = "a_domicile" | "stop_desk";

const DELIVERY_MODE_LABELS: Record<CustomerDeliveryMode, string> = {
  a_domicile: "A domicile",
  stop_desk: "Stop desk",
};

const DELIVERY_MODE_OPTIONS: { value: CustomerDeliveryMode; label: string }[] =
  [
    { value: "a_domicile", label: DELIVERY_MODE_LABELS.a_domicile },
    { value: "stop_desk", label: DELIVERY_MODE_LABELS.stop_desk },
  ];

const DELIVERY_MODE_HEADER_KEYS = [
  "Type de livraison",
  "Type livraison",
  "Mode de livraison",
  "Livraison",
  "Livraison type",
  "stop_desk",
  "stop desk",
  "stopdesk",
];

const DELIVERY_MODE_HEADER_KEY_SET = new Set(
  DELIVERY_MODE_HEADER_KEYS.map(normalizeHeaderKey)
);

const normalizeSheetDeliveryMode = (value: string): CustomerDeliveryMode => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return "stop_desk"; // par défaut, mieux vaut conserver stop desk pour éviter l'envoi à domicile par erreur

  // Valeurs numériques / booléennes fréquemment utilisées dans les feuilles
  if (raw === "1" || raw === "true" || raw === "oui" || raw === "yes") {
    return "stop_desk";
  }
  if (raw === "0" || raw === "false" || raw === "non" || raw === "no") {
    return "a_domicile";
  }

  const normalized = normalizeTextValue(raw);
  if (
    normalized.includes("home") ||
    normalized.includes("domicile") ||
    normalized.includes("maison")
  ) {
    return "a_domicile";
  }
  if (
    normalized.includes("stop") ||
    normalized.includes("desk") ||
    normalized.includes("point") ||
    normalized.includes("relais") ||
    normalized.includes("pickup")
  ) {
    return "stop_desk";
  }
  // Ambigu : privilégier stop desk pour éviter un mauvais routage domicile
  return "stop_desk";
};

const getDeliveryModeDisplayLabel = (
  rawValue: string,
  mode: CustomerDeliveryMode
): string => {
  const trimmed = String(rawValue ?? "").trim();
  if (trimmed) return trimmed;
  return DELIVERY_MODE_LABELS[mode] ?? DELIVERY_MODE_LABELS.a_domicile;
};

const buildDeliveryModeSelectState = (
  rawValue: string,
  mode: CustomerDeliveryMode
): { value: string; options: { value: string; label: string }[] } => {
  const displayLabel = getDeliveryModeDisplayLabel(rawValue, mode);
  const isCustomLabel =
    displayLabel.trim() !== "" && displayLabel !== DELIVERY_MODE_LABELS[mode];
  if (!isCustomLabel) {
    return { value: mode, options: DELIVERY_MODE_OPTIONS };
  }
  const customValue = `raw:${mode}`;
  return {
    value: customValue,
    options: [{ value: customValue, label: displayLabel }, ...DELIVERY_MODE_OPTIONS],
  };
};

const normalizeDeliveryModeSelectValue = (
  value: string
): CustomerDeliveryMode => {
  const trimmed = value.trim();
  if (trimmed.startsWith("raw:")) {
    return trimmed.slice(4) as CustomerDeliveryMode;
  }
  return trimmed as CustomerDeliveryMode;
};

const applyDeliveryModeToRow = (row: OrderRow, label: string): OrderRow => {
  const nextRow: OrderRow = { ...row };
  let updated = false;
  Object.keys(nextRow).forEach((key) => {
    if (DELIVERY_MODE_HEADER_KEY_SET.has(normalizeHeaderKey(key))) {
      nextRow[key] = label;
      updated = true;
    }
  });
  if (!updated) {
    nextRow["Type de livraison"] = label;
  }
  return nextRow;
};

const getDeliveryModeFromRow = (row: OrderRow): CustomerDeliveryMode => {
  for (const key of Object.keys(row)) {
    const normalizedKey = normalizeHeaderKey(key);
    if (
      DELIVERY_MODE_HEADER_KEY_SET.has(normalizedKey) ||
      normalizedKey.includes("stopdesk")
    ) {
      return normalizeSheetDeliveryMode(String(row[key] ?? ""));
    }
  }
  return "a_domicile";
};


const Orders: React.FC = () => {
  const { token, user } = useContext(AuthContext);
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
    { wilaya_id: 49, wilaya_name: "Timimoun" },
    { wilaya_id: 50, wilaya_name: "Bordj Badji Mokhtar" },
    { wilaya_id: 51, wilaya_name: "Ouled Djellal" },
    { wilaya_id: 52, wilaya_name: "Beni Abbes" },
    { wilaya_id: 53, wilaya_name: "In Salah" },
    { wilaya_id: 54, wilaya_name: "In Guezzam" },
    { wilaya_id: 55, wilaya_name: "Touggourt" },
    { wilaya_id: 56, wilaya_name: "Djanet" },
    { wilaya_id: 57, wilaya_name: "El M'Ghair" },
    { wilaya_id: 58, wilaya_name: "El Meniaa" },
  ];

  function getWilayaIdByName(name: string) {
    if (!name || !name.trim()) {
      return 0;
    }
    
    const normalize = (s: string) =>
      (s || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/ +/g, " ");
    
    const target = normalize(name);
    
    // Chercher d'abord avec le nom exact
    let found = WILAYAS.find((w) => normalize(w.wilaya_name) === target);
    
    // Si pas trouvé, essayer avec getFrenchWilaya pour normaliser (gère l'arabe)
    if (!found && name.trim()) {
      const normalizedName = getFrenchWilaya(name);
      if (normalizedName && normalizedName !== name) {
        found = WILAYAS.find((w) => normalize(w.wilaya_name) === normalize(normalizedName));
      }
    }
    
    // Si toujours pas trouvé, essayer une correspondance partielle
    if (!found) {
      found = WILAYAS.find((w) => {
        const normalizedWilaya = normalize(w.wilaya_name);
        return normalizedWilaya.includes(target) || target.includes(normalizedWilaya);
      });
    }
    
    return found ? found.wilaya_id : 0;
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

  // Fonction pour extraire le total depuis le sheet
  const extractTotal = (row: OrderRow): string => {
    // Rechercher le champ "total" (en priorité)
    const candidates = [
      "total",
      "Total",
      "TOTAL",
      "Montant",
      "Montant total",
      "Prix total",
    ];

    for (const key of candidates) {
      if (key in row) {
        const parsed = parseLocaleAmount(row[key]);
        if (parsed !== null) {
          // Formater avec séparateur de milliers
          return (
            parsed.toLocaleString("fr-FR", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            }) + " DA"
          );
        }
      }
    }

    // Si pas trouvé, essayer de calculer depuis prix unitaire * quantité
    const quantityForTotal = (() => {
      return parsePositiveIntegerQuantity(
        row["Quantité"] || row["Quantite"] || row["Qte"]
      ) ?? 1;
    })();

    const unitPriceForTotal = (() => {
      const priceCandidates = [
        "Prix unitaire",
        "Prix",
        "PrixU",
        "PU",
        "Prix U",
      ];
      for (const key of priceCandidates) {
        if (key in row) {
          const parsed = parseLocaleAmount(row[key]);
          if (parsed !== null) return parsed;
        }
      }
      return null;
    })();

    if (unitPriceForTotal !== null) {
      const computed = unitPriceForTotal * quantityForTotal;
      return (
        computed.toLocaleString("fr-FR", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }) + " DA"
      );
    }

    return "—";
  };

  const resolveCommentKey = (summary: OrderSummary, fallback: string) => {
    const normalize = (value?: string | null) => {
      if (!value) return "";
      const trimmed = value.trim();
      return trimmed;
    };

    const candidates = [
      normalize(summary.rowId),
      normalize(summary.displayRowLabel),
      normalize(summary.rawName),
      normalize(summary.name),
    ];

    for (const candidate of candidates) {
      if (candidate) {
        return candidate;
      }
    }

    return fallback;
  };

  const OrderActionButtons = React.memo(function OrderActionButtons({
    row,
    summary,
    onUpdateStatus,
    variant = "table",
    commentKey,
    commentValue = "",
    onCommentChange,
    onSubmittingChange,
  }: {
    row: OrderRow;
    summary: OrderSummary;
    onUpdateStatus: (
      rowId: string,
      status: SheetStatus,
      context?: UpdateStatusContext
    ) => Promise<void>;
    variant?: "table" | "modal";
    commentKey?: string;
    commentValue?: string;
    onCommentChange?: (key: string, value: string) => void;
    onSubmittingChange?: (value: boolean) => void;
  }) {
    const {
      name: nom_client,
      phoneDial: telephone,
      status: initialSheetStatus,
      rowId,
      displayRowLabel,
    } = summary;

    const effectiveCommentKey = React.useMemo(
      () =>
        commentKey ||
        rowId ||
        displayRowLabel ||
        (nom_client ? `order-${nom_client}` : "order"),
      [commentKey, rowId, displayRowLabel, nom_client]
    );
    const currentComment = commentValue ?? "";
    const updateComment = React.useCallback(
      (value: string) => {
        if (onCommentChange) {
          onCommentChange(effectiveCommentKey, value);
        }
      },
      [effectiveCommentKey, onCommentChange]
    );

    const telephone_2 = normalizePhone(
      firstNonEmptyRowValue(row, [
        "Numero 2",
        "Numéro 2",
        "Téléphone 2",
        "Telephone 2",
        "Tel 2",
        "Phone 2",
      ])
    );
    const code_wilaya = getWilayaIdByName(row["Wilaya"]);

    const stopDeskFlag = (() => {
      const normalizedMode = getDeliveryModeFromRow(row);
      return normalizedMode === "stop_desk" ? 1 : 0;
    })();

    const quantityForApi = parsePositiveIntegerQuantity(
      row["Quantité"] || row["Quantite"] || row["Qte"]
    );

    const totalForApi = (() => {
      const unitPriceForTotal = (() => {
        const candidates = ["Prix unitaire", "Prix", "PrixU", "PU", "Prix U"];
        for (const key of candidates) {
          if (key in row) {
            const parsed = parseLocaleAmount(row[key]);
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
            const parsed = parseLocaleAmount(row[key]);
            if (parsed !== null) return parsed;
          }
        }
        return null;
      })();

      const computedFromUnit =
        unitPriceForTotal !== null && quantityForApi !== null
          ? unitPriceForTotal * quantityForApi
          : null;
      return amountFromSheet ?? computedFromUnit;
    })();


    const [submitting, setSubmitting] = React.useState<boolean>(false);
    const [delivering, setDelivering] = React.useState<boolean>(false);
    const [abandoning, setAbandoning] = React.useState<boolean>(false);
    const [deliveryType, setDeliveryType] =
      React.useState<DeliveryType>("api_dhd");
    const [deliveryPersonId, setDeliveryPersonId] = React.useState<
      string | null
    >(null);

    React.useEffect(() => {
      if (variant !== "modal") return;
      const currentRowId = String(row["id-sheet"] || row["ID"] || "");
      const persisted = orderDeliverySettings[currentRowId];
      if (!persisted) return;
      setDeliveryType(persisted.deliveryType);
      setDeliveryPersonId(persisted.deliveryPersonId);
    }, [orderDeliverySettings, row, variant]);

    const [correctionModalOpen, setCorrectionModalOpen] = React.useState(false);
    const [initialCorrectionData, setInitialCorrectionData] = React.useState<{
      commune: string;
      wilayaCode: number;
    }>({ commune: "", wilayaCode: 16 });

    const handleCorrectionConfirm = (wilayaCode: number, communeName: string) => {
      setCorrectionModalOpen(false);
      handleSendToApi(communeName, wilayaCode);
    };

    React.useEffect(() => {
      if (onSubmittingChange) {
        onSubmittingChange(submitting);
      }
    }, [submitting, onSubmittingChange]);

    const resolveDeliverySettings = React.useCallback(() => {
      const currentRowId = String(row["id-sheet"] || row["ID"] || "");
      if (variant === "modal") {
        return {
          currentRowId,
          deliverySettings: { deliveryType, deliveryPersonId },
        };
      }
      const deliverySettings = orderDeliverySettings[currentRowId] || {
        deliveryType: "api_dhd" as DeliveryType,
        deliveryPersonId: null,
      };
      return { currentRowId, deliverySettings };
    }, [deliveryPersonId, deliveryType, orderDeliverySettings, row, variant]);

    const handleSendToApi = React.useCallback(async (manualCommune?: string, manualWilaya?: number) => {
      // Récupérer les paramètres de livraison pour cette commande
      const { currentRowId, deliverySettings } = resolveDeliverySettings();
      const { deliveryType: selectedDeliveryType, deliveryPersonId } =
        deliverySettings;

      const showToast = (
        message: string,
        variant: "success" | "warning" = "success",
        duration = variant === "success" ? 3000 : 5000
      ) => {
        if (typeof document === "undefined") {
          return;
        }

        const baseStyles: Record<string, string> = {
          position: "fixed",
          bottom: "24px",
          left: "50%",
          transform: "translateX(-50%)",
          color: "#fff",
          padding: "12px 18px",
          borderRadius: "12px",
          boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          fontSize: "0.9rem",
          fontWeight: "600",
          zIndex: "2000",
          opacity: "0",
          transition: "opacity 0.3s ease",
          maxWidth: "90%",
          textAlign: "center",
          pointerEvents: "none",
        };

        const gradients: Record<"success" | "warning", string> = {
          success: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
          warning: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
        };

        const toast = document.createElement("div");
        toast.textContent = message;
        Object.assign(toast.style, baseStyles, {
          background: gradients[variant],
        });
        document.body.appendChild(toast);

        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => {
            toast.style.opacity = "1";
          });
        } else {
          setTimeout(() => {
            toast.style.opacity = "1";
          }, 0);
        }

        setTimeout(() => {
          toast.style.opacity = "0";
          setTimeout(() => toast.remove(), 400);
        }, duration);
      };
      // Validation : si le type de livraison est "livreur", un livreur doit être sélectionné
      if (selectedDeliveryType === "livreur" && !deliveryPersonId) {
        alert("Veuillez sélectionner un livreur pour cette commande.");
        return;
      }

      // Commune resolution
      const parsedWilaya = Number(manualWilaya ?? code_wilaya);
      if (
        !Number.isInteger(parsedWilaya) ||
        parsedWilaya < 1 ||
        parsedWilaya > 58
      ) {
        setInitialCorrectionData({ commune: "", wilayaCode: 16 });
        setCorrectionModalOpen(true);
        return;
      }
      const codeW = parsedWilaya;
      let commune = manualCommune || resolveCommuneName(
        row["Commune"] || "",
        row["Wilaya"] || "",
        codeW
      );

      if (!commune) {
        setCommuneSelector({
          isOpen: true,
          wilayaCode: codeW,
          wilayaName: String(row["Wilaya"] || ""),
          onSelect: async (selectedCommune: string) => {
            const trimmedCommune = String(selectedCommune || "").trim();
            if (!trimmedCommune) return;

            const targetRowId = String(row["id-sheet"] || row["ID"] || "").trim();
            if (targetRowId) {
              setRows((prevRows) =>
                prevRows.map((existingRow) => {
                  const existingRowId = String(
                    existingRow["id-sheet"] || existingRow["ID"] || ""
                  ).trim();
                  if (existingRowId === targetRowId) {
                    const updatedRow: OrderRow = {
                      ...existingRow,
                      Commune: trimmedCommune,
                    };
                    if ("commune" in existingRow) {
                      updatedRow["commune"] = trimmedCommune;
                    }
                    return updatedRow;
                  }
                  return existingRow;
                })
              );
              setSelectedOrder((prev) => {
                if (!prev) return prev;
                const selectedRowId = String(
                  prev["id-sheet"] || prev["ID"] || ""
                ).trim();
                if (selectedRowId === targetRowId) {
                  const updatedRow: OrderRow = {
                    ...prev,
                    Commune: trimmedCommune,
                  };
                  if ("commune" in prev) {
                    updatedRow["commune"] = trimmedCommune;
                  }
                  return updatedRow;
                }
                return prev;
              });
            }

            setCommuneSelector(prev => ({ ...prev, isOpen: false }));

            try {
              await handleWilayaCommuneChange(row, undefined, trimmedCommune);
            } catch (error) {
              console.warn("Erreur lors de la mise à jour de la commune:", error);
            }

            handleSendToApi(trimmedCommune, codeW);
          }
        });
        return;
      }

      // La commune resolue doit rester cohérente avec une wilaya officielle.
      const resolvedWilayaCode =
        manualWilaya ?? getWilayaIdByCommune(commune, codeW);
      const adr = String(
        row["Adresse"] ?? row["adresse"] ?? row["Address"] ?? ""
      ).trim();
      const validationErrors: string[] = [];
      if (!rowId) validationErrors.push("identifiant de ligne");
      if (!nom_client) validationErrors.push("nom du client");
      if (!/^\d{9,10}$/.test(telephone)) {
        validationErrors.push("telephone valide (9 ou 10 chiffres)");
      }
      if (!adr) validationErrors.push("adresse");
      if (
        !Number.isInteger(resolvedWilayaCode) ||
        resolvedWilayaCode < 1 ||
        resolvedWilayaCode > 58
      ) {
        validationErrors.push("wilaya");
      }
      if (totalForApi === null || !Number.isFinite(totalForApi) || totalForApi < 0) {
        validationErrors.push("montant total");
      }
      if (validationErrors.length > 0) {
        alert(
          `Impossible d'envoyer la commande à DHD. Champs manquants ou invalides : ${validationErrors.join(
            ", "
          )}.`
        );
        return;
      }

      setSubmitting(true);

      const rawProductLabel =
        extractProductLabel(row) || String(row["Produit"] ?? "").trim();
      const produit = rawProductLabel;
      const remarkFromSheet = (() => {
        const remarkKeys = [
          "Remarque",
          "Remarques",
          "Commentaire",
          "Commentaires",
          "Note",
          "Notes",
          "Observation",
          "Observations",
        ];
        for (const key of remarkKeys) {
          const value = row[key];
          if (value === undefined || value === null) {
            continue;
          }
          const trimmed = String(value).trim();
          if (trimmed) {
            return trimmed;
          }
        }
        return "";
      })();

      const realClientData = {
        reference: extractReference(row) || rowId,
        nom_client,
        telephone,
        telephone_2,
        adresse: adr,
        code_postal: firstNonEmptyRowValue(row, [
          "Code postal",
          "Code Postal",
          "code_postal",
          "CP",
        ]),
        code_wilaya: resolvedWilayaCode,
        montant: String(Math.round(totalForApi as number)),
        type: "1",
        stop_desk: stopDeskFlag,
        stock: "0",
        quantite: quantityForApi ?? undefined,
        fragile: readBooleanRowFlag(row, ["Fragile", "fragile"]),
        produit: produit,
        produit_a_recuperer: firstNonEmptyRowValue(row, [
          "Produit à récupérer",
          "Produit a recuperer",
          "produit_a_recuperer",
        ]),
        boutique: firstNonEmptyRowValue(row, ["Boutique", "Shop"]),
        weight: firstNonEmptyRowValue(row, ["Poids", "Weight"]),
        gps_link: firstNonEmptyRowValue(row, [
          "Lien GPS",
          "GPS",
          "gps_link",
        ]),
      };
      const trimmedComment = currentComment.trim();
      const finalRemark = trimmedComment || remarkFromSheet;

      // Normalize commune name for API - remove accents (DHD API doesn't accept them)
      const communeForApi = commune
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      const finalData = {
        ...realClientData,
        commune: communeForApi,
        Remarque: finalRemark,
        remarque: finalRemark,
      };

      if (DEBUG_ORDERS) {
        debugLog("Données normalisées", {
          rowId,
          hasCommune: Boolean(commune),
          hasPhone: Boolean(telephone),
          hasName: Boolean(nom_client),
          wilayaCodeValid: resolvedWilayaCode >= 1 && resolvedWilayaCode <= 58,
        });
      }

      let currentStatus: SheetStatus = initialSheetStatus;

      const applyStatusUpdate = async (
        nextStatus: SheetStatus,
        trackingValue: string,
        persist = true
      ) => {
        await onUpdateStatus(rowId, nextStatus, {
          previousStatus: currentStatus,
          row: { ...row, etat: nextStatus },
          tracking: trackingValue || undefined,
          deliveryType: selectedDeliveryType,
          deliveryPersonId: deliveryPersonId || undefined,
          persist,
        });
        currentStatus = nextStatus;
      };

      try {
        if (selectedDeliveryType === "livreur") {
          try {
            await applyStatusUpdate("Assigné", "");
            showToast(
              `✅ Commande assignée au livreur pour ${nom_client}`,
              "success",
              3200
            );
            if (trimmedComment) {
              updateComment("");
            }
          } catch (assignError) {
            console.error(
              "Erreur lors de l'assignation au livreur:",
              assignError
            );
            const message =
              assignError instanceof Error
                ? assignError.message
                : String(assignError);
            alert(
              `❌ Erreur lors de l'assignation au livreur.\n\nClient: ${nom_client}\n\nErreur: ${message}`
            );
          }
          return;
        }

        if (DEBUG_ORDERS) {
          debugLog("Envoi securise via le backend", { rowId });
        }

        const response = await apiFetch("/api/orders/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowId,
            deliveryType: selectedDeliveryType,
            order: finalData,
            row,
            validate: true,
            askCollection: 0,
          }),
        });
        const responseData = await response.json().catch(() => ({}));

        if (DEBUG_ORDERS) {
          debugLog("Réponse backend", response.status, {
            success: responseData?.success === true,
            hasTracking: Boolean(responseData?.tracking),
          });
        }

        if (
          response.ok &&
          responseData?.success === true &&
          typeof responseData?.tracking === "string" &&
          responseData.tracking.trim()
        ) {
          const trackingValue = responseData.tracking.trim();
          const carrierLabel =
            selectedDeliveryType === "api_sook" ? "Sook en ligne" : "BL Bébé";

          showToast(
            `✅ Commande envoyée avec succès (${nom_client}) via ${carrierLabel}`,
            "success",
            3200
          );
          if (responseData.warning) {
            showToast(
              String(responseData.warning),
              "warning",
              6000
            );
          }

          // Le backend a deja persiste MongoDB + Google Sheets + le stock.
          await applyStatusUpdate(
            typeof responseData.status === "string"
              ? responseData.status
              : "ready_to_ship",
            trackingValue,
            false
          );
          if (trimmedComment) {
            updateComment("");
          }
        } else if (response.status === 429) {
          alert(
            `⚠️ Trop de requêtes (429)\n\nClient: ${nom_client}\n\nVeuillez réessayer plus tard.`
          );
        } else {
          // Check for 422 errors related to Commune/Wilaya
          if (response.status === 422) {
            const errorMsg = JSON.stringify(responseData).toLowerCase();
            if (errorMsg.includes("commune") || errorMsg.includes("wilaya")) {
              setInitialCorrectionData({
                commune: commune || "",
                wilayaCode: resolvedWilayaCode || 16
              });
              setCorrectionModalOpen(true);
              return; // Stop here, don't alert
            }
          }

          alert(
            `❌ Erreur API (${response.status
            })\n\nClient: ${nom_client}\n\nErreur:\n${JSON.stringify(
              responseData,
              null,
              2
            )}`
          );
        }
      } catch (error) {
        console.error("Erreur lors de l'appel au backend de livraison:", error);
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        alert(
          `❌ Erreur réseau\n\nClient: ${nom_client}\n\nErreur: ${errorMessage}`
        );
      } finally {
        setSubmitting(false);
        if (onSubmittingChange) {
          onSubmittingChange(false);
        }
      }
    }, [
      nom_client,
      telephone,
      telephone_2,
      code_wilaya,
      totalForApi,
      stopDeskFlag,
      row,
      onUpdateStatus,
      initialSheetStatus,
      rowId,
      currentComment,
      updateComment,
      resolveDeliverySettings,
      handleWilayaCommuneChange,
    ]);

    const handleMarkAbandoned = React.useCallback(async () => {
      const confirmed = window.confirm(
        `Confirmer l'abandon de la commande ${displayRowLabel || ""} ?`
      );
      if (!confirmed) return;
      try {
        setAbandoning(true);
        const { deliverySettings } = resolveDeliverySettings();
        const { deliveryType: selectedDeliveryType, deliveryPersonId } =
          deliverySettings;
        const resolvedDeliveryPersonId =
          selectedDeliveryType === "livreur" && deliveryPersonId
            ? deliveryPersonId
            : undefined;
        await onUpdateStatus(rowId, "abandoned", {
          previousStatus: initialSheetStatus,
          row: { ...row, etat: "abandoned" },
          deliveryType: selectedDeliveryType,
          deliveryPersonId: resolvedDeliveryPersonId,
        });
      } catch (e: any) {
        const message =
          e?.message || "Erreur lors de la mise à jour du statut abandonné";
        alert(message);
      } finally {
        setAbandoning(false);
      }
    }, [
      displayRowLabel,
      initialSheetStatus,
      onUpdateStatus,
      resolveDeliverySettings,
      row,
      rowId,
    ]);

    const handleMarkDelivered = React.useCallback(async () => {
      try {
        setDelivering(true);
        const { deliverySettings } = resolveDeliverySettings();
        const { deliveryType: selectedDeliveryType, deliveryPersonId } =
          deliverySettings;
        const resolvedDeliveryPersonId =
          selectedDeliveryType === "livreur" && deliveryPersonId
            ? deliveryPersonId
            : undefined;
        // La mise a jour du statut declenche l'unique reconciliation de stock cote backend.
        await onUpdateStatus(rowId, "delivered", {
          previousStatus: initialSheetStatus,
          row: { ...row, etat: "delivered" },
          deliveryType: selectedDeliveryType,
          deliveryPersonId: resolvedDeliveryPersonId,
        });
      } catch (e: any) {
        const errorMessage = e?.message || "Erreur lors de la livraison";
        alert(errorMessage);
      } finally {
        setDelivering(false);
      }
    }, [
      initialSheetStatus,
      onUpdateStatus,
      resolveDeliverySettings,
      row,
      rowId,
    ]);

    const containerClass =
      variant === "modal" ? "orders-modal__actions" : "orders-table__actions";

    if (variant === "modal") {
      const sanitizedCommentKey = effectiveCommentKey
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-");
      const commentFieldId = `order-comment-${sanitizedCommentKey || "field"}`;
      return (
        <div className="orders-modal__actions-container">
          <div className="orders-modal__comment">
            <label
              htmlFor={commentFieldId}
              className="orders-modal__comment-label"
            >
              Commentaire (optionnel)
            </label>
            <textarea
              id={commentFieldId}
              className="orders-modal__comment-input"
              placeholder="Ajouter une remarque pour la livraison"
              value={currentComment}
              onChange={(event) => updateComment(event.target.value)}
              maxLength={255}
              rows={3}
            />
            <p className="orders-modal__comment-hint">
              Ce commentaire sera envoyé avec la commande.
            </p>
          </div>

          <DeliverySelection
            onDeliveryTypeChange={setDeliveryType}
            onDeliveryPersonChange={setDeliveryPersonId}
            deliveryType={deliveryType}
            deliveryPersonId={deliveryPersonId}
          />

          <div className={containerClass}>
            <button
              type="button"
              onClick={() => handleSendToApi()}
              disabled={submitting || delivering || abandoning}
              className={`orders-button orders-button--primary orders-modal__action-button${submitting ? " is-loading" : ""
                }`}
            >
              {submitting ? "Envoi…" : "Confirmer et envoyer"}
            </button>
            <button
              type="button"
              onClick={handleMarkDelivered}
              disabled={delivering || submitting || abandoning}
              className={`orders-button orders-button--success orders-modal__action-button${delivering ? " is-loading" : ""
                }`}
            >
              {delivering ? "Traitement…" : "Marquer livrée"}
            </button>
            <button
              type="button"
              onClick={handleMarkAbandoned}
              disabled={abandoning || submitting}
              className={`orders-button orders-button--danger orders-modal__action-button${abandoning ? " is-loading" : ""
                }`}
            >
              {abandoning ? "Abandon…" : "Abandonnée"}
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className={containerClass}>
          <button
            type="button"
            onClick={() => handleSendToApi()}
            disabled={submitting || abandoning}
            className={`orders-button orders-button--primary orders-button--icon${submitting ? " is-loading" : ""
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
            className={`orders-button orders-button--danger${abandoning ? " is-loading" : ""
              }`}
          >
            {abandoning ? "Abandon…" : "Abandonnée"}
          </button>
          <button
            type="button"
            onClick={handleMarkDelivered}
            disabled={delivering || submitting || abandoning}
            className={`orders-button orders-button--success${delivering ? " is-loading" : ""
              }`}
          >
            {delivering ? "Traitement…" : "Marquer livrée"}
          </button>
        </div>
        <CommuneCorrectionModal
          isOpen={correctionModalOpen}
          onClose={() => setCorrectionModalOpen(false)}
          onConfirm={handleCorrectionConfirm}
          initialCommune={initialCorrectionData.commune}
          initialWilayaCode={initialCorrectionData.wilayaCode}
        />
      </>
    );
  });

  const OrderRowItem = React.memo(function OrderRowItem({
    row,
    idx,
    headers,
    summary,
    onUpdateStatus,
    onVariantClick,
    onDeliveryTypeChange,
    onWilayaCommuneChange,
    commentKey,
    commentValue,
    onCommentChange,
    onCommentEdit,
    renderSelectionCell,
  }: {
    row: OrderRow;
    idx: number;
    headers: string[];
    summary: OrderSummary;
    onUpdateStatus: (
      rowId: string,
      status: SheetStatus,
      context?: UpdateStatusContext
    ) => Promise<void>;
    onVariantClick: (row: OrderRow) => void;
    onDeliveryTypeChange: (
      row: OrderRow,
      nextMode: CustomerDeliveryMode
    ) => void;
    onWilayaCommuneChange: (
      row: OrderRow,
      wilaya?: string,
      commune?: string
    ) => void;
    commentKey: string;
    commentValue: string;
    onCommentChange: (key: string, value: string) => void;
    onCommentEdit: (
      commentKey: string,
      commentValue: string,
      summary: OrderSummary
    ) => void;
    renderSelectionCell?: () => React.ReactNode;
  }) {
    const { name: nom_client, phoneDial: telephone } = summary;

    const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
    const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
      null
    );
    const [rowSubmitting, setRowSubmitting] = React.useState(false);

    const sanitizedCommentKey = React.useMemo(
      () =>
        (commentKey || "")
          .toString()
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]+/g, "-"),
      [commentKey]
    );
    const commentFieldId = React.useMemo(
      () => `orders-table-comment-${sanitizedCommentKey || `row-${idx}`}`,
      [sanitizedCommentKey, idx]
    );
  const handleCommentEdit = React.useCallback(() => {
      debugLog("comment edit trigger", {
        commentKey,
        length: commentValue?.length || 0,
        preview: (commentValue || "").slice(0, 120),
        rowId: summary.rowId,
        scroll: getScrollSnapshot(),
      });
      onCommentEdit(commentKey, commentValue, summary);
    }, [commentKey, commentValue, onCommentEdit, summary]);

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

    const rowClassName = rowSubmitting
      ? "orders-row orders-row--submitting"
      : "orders-row";

    return (
      <tr className={rowClassName}>
        {renderSelectionCell && renderSelectionCell()}
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
          const normalizedHeaderKeyForMatch = normalizeHeaderKey(h || "");
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
          const isProductColumn =
            normalizedHeader.includes("produit") ||
            normalizedHeaderKeyForMatch === "product" ||
            normalizedHeaderKeyForMatch === "product_name";
          const isWilayaColumn =
            normalizedHeader.includes("wilaya") ||
            normalizedHeaderKeyForMatch === "wilaya";
          const isCommuneColumn =
            normalizedHeader.includes("commune") ||
            normalizedHeaderKeyForMatch === "commune";
          const isQuantityColumn =
            normalizedHeader.includes("quantite") ||
            normalizedHeader.includes("quantité") ||
            normalizedHeader.includes("qte") ||
            normalizedHeaderKeyForMatch === "quantite";
          const isDeliveryTypeColumn = DELIVERY_MODE_HEADER_KEY_SET.has(
            normalizedHeaderKeyForMatch
          );
          const copyKey = `${idx}-${normalizedHeader || h}`;

          if (isDeliveryTypeColumn) {
      const currentMode = normalizeSheetDeliveryMode(trimmedDisplayText);
      const deliveryModeSelect = buildDeliveryModeSelectState(
        trimmedDisplayText,
        currentMode
      );
      return (
              <td
                key={h}
                className="orders-table__cell orders-table__cell--delivery-type"
              >
                <select
                  value={deliveryModeSelect.value}
                  onChange={(event) =>
                    preserveScroll(async () => {
                      const nextMode = normalizeDeliveryModeSelectValue(
                        event.target.value
                      );
                      debugLog("table delivery select change", {
                        rowId: row["id-sheet"] || row["ID"],
                        nextMode,
                        scroll: getScrollSnapshot(),
                      });
                      await handleDeliveryTypeChange(row, nextMode);
                    })
                  }
                  className="orders-table__delivery-type-select"
                  aria-label="Type de livraison"
                  onClick={(event) => event.stopPropagation()}
                >
                  {deliveryModeSelect.options.map((option) => (
                    <option    
                      key={`${option.value}-${option.label}`}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </td>
            );
          }

          if (isVariantColumn) {
            const variantFromRow = trimmedDisplayText;
            const fallbackVariant = extractVariantValue(row);
            const meaningfulRowVariant =
              variantFromRow && isMeaningfulVariantName(variantFromRow)
                ? variantFromRow
                : "";
            const meaningfulFallbackVariant =
              fallbackVariant && isMeaningfulVariantName(fallbackVariant)
                ? fallbackVariant
                : "";
            const variantLabel = (
              meaningfulRowVariant ||
              meaningfulFallbackVariant ||
              (variantFromRow ? variantFromRow : "")
            ).trim();

            if (!variantLabel) {
              return (
                <td
                  key={h}
                  className="orders-table__cell orders-table__cell--variant"
                  data-label={h || "Variante"}
                >
                  <span className="orders-table__muted">—</span>
                </td>
              );
            }

            return (
              <td
                key={h}
                className="orders-table__cell orders-table__cell--variant"
                data-label={h || "Variante"}
              >
                <button
                  type="button"
                  className="orders-table__variant"
                  onClick={() => onVariantClick(row)}
                  title="Cliquer pour changer la variante"
                >
                  <span className="orders-table__variant-name">
                    {variantLabel}
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
 
          if (isProductColumn) {
            return (
              <td
                key={h}
                className="orders-table__cell orders-table__cell--product"
                data-label={h || "Produit"}
                title={trimmedDisplayText}
              >
                {trimmedDisplayText ? (
                  <span className="orders-table__product-text">
                    {trimmedDisplayText}
                  </span>
                ) : (
                  <span className="orders-table__muted">—</span>
                )}
              </td>
            );
          }

          if (isWilayaColumn || isCommuneColumn) {
            const wilayaId = row["Wilaya"] || row["wilaya"] || "";
            const communeName = row["Commune"] || row["commune"] || "";
            
            // Normaliser la wilaya pour la recherche
            const normalizeWilaya = (s: string) =>
              (s || "")
                .trim()
                .toLowerCase()
                .normalize("NFD")
                .replace(/[̀-ͯ]/g, "")
                .replace(/ +/g, " ");
            
            // D'abord, essayer de normaliser avec getFrenchWilaya (gère l'arabe et les variantes)
            const normalizedWilayaName = wilayaId ? getFrenchWilaya(wilayaId) : "";
            
            // Chercher dans WILAYAS avec le nom normalisé
            let currentWilayaCode: number;
            let currentWilayaName: string;
            
            if (normalizedWilayaName) {
              const foundWilaya = WILAYAS.find((w) => 
                normalizeWilaya(w.wilaya_name) === normalizeWilaya(normalizedWilayaName)
              );
              
              if (foundWilaya) {
                currentWilayaCode = foundWilaya.wilaya_id;
                currentWilayaName = foundWilaya.wilaya_name;
              } else {
                // Si getFrenchWilaya a retourné quelque chose mais pas trouvé dans WILAYAS,
                // essayer directement avec le nom original
                const foundByOriginal = WILAYAS.find((w) =>
                  normalizeWilaya(w.wilaya_name) === normalizeWilaya(wilayaId)
                );
                if (foundByOriginal) {
                  currentWilayaCode = foundByOriginal.wilaya_id;
                  currentWilayaName = foundByOriginal.wilaya_name;
                } else {
                  // Une wilaya inconnue reste invalide : ne jamais l'envoyer comme Alger.
                  currentWilayaCode = getWilayaIdByName(wilayaId);
                  currentWilayaName = wilayaId;
                }
              }
            } else if (wilayaId) {
              // Pas de normalisation possible, essayer directement
              const foundByOriginal = WILAYAS.find((w) =>
                normalizeWilaya(w.wilaya_name) === normalizeWilaya(wilayaId)
              );
              if (foundByOriginal) {
                currentWilayaCode = foundByOriginal.wilaya_id;
                currentWilayaName = foundByOriginal.wilaya_name;
              } else {
                currentWilayaCode = getWilayaIdByName(wilayaId);
                currentWilayaName = wilayaId;
              }
            } else {
              currentWilayaCode = 0;
              currentWilayaName = "";
            }
            
            const communesForWilaya = getCommunesByWilaya(currentWilayaCode);

            if (isWilayaColumn) {
              const wilayaOptions = WILAYAS.map(w => ({
                value: w.wilaya_id,
                label: w.wilaya_name
              }));

              return (
                <td
                  key={h}
                  className="orders-table__cell orders-table__cell--location"
                  data-label={h || "Wilaya"}
                >
                  <SearchableSelect
                    value={currentWilayaCode}
                    options={wilayaOptions}
                    onChange={(newWilayaCode) => {
                      const newWilayaName = WILAYAS.find(w => w.wilaya_id === newWilayaCode)?.wilaya_name || "";
                      if (newWilayaName) {
                        handleWilayaCommuneChange(row, newWilayaName);
                      }
                    }}
                    placeholder="Rechercher une wilaya..."
                    className="orders-table__wilaya-select"
                    ariaLabel="Wilaya"
                    emptyMessage="Aucune wilaya trouvée"
                  />
                </td>
              );
            }

            if (isCommuneColumn) {
              const currentCommuneFr = getFrenchForDisplay(communeName, wilayaId) || communeName;
              const currentCommuneMatch = communesForWilaya.find(
                c => c.fr === currentCommuneFr || c.ar === communeName
              );
              const selectedValue = currentCommuneMatch?.fr || (currentCommuneFr || "");

              const communeOptions = [
                { value: "", label: "—" },
                ...communesForWilaya.map(c => ({
                  value: c.fr,
                  label: c.fr
                }))
              ];

              return (
                <td
                  key={h}
                  className="orders-table__cell orders-table__cell--location"
                  data-label={h || "Commune"}
                >
                  <SearchableSelect
                    value={selectedValue || ""}
                    options={communeOptions}
                    onChange={(newCommuneFr) => {
                      const value = typeof newCommuneFr === "string" ? newCommuneFr : String(newCommuneFr);
                      handleWilayaCommuneChange(row, undefined, value || undefined);
                    }}
                    placeholder="Rechercher une commune..."
                    className="orders-table__commune-select"
                    ariaLabel="Commune"
                    emptyMessage="Aucune commune trouvée"
                  />
                </td>
              );
            }
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

            const normalizedForWhatsapp = normalizePhone(
              rawPhoneValue || trimmedDisplayText
            );
            const whatsappPhone = normalizedForWhatsapp.startsWith("0")
              ? "213" + normalizedForWhatsapp.slice(1)
              : normalizedForWhatsapp;
            const whatsappUrl = `https://wa.me/${whatsappPhone.replace(
              /\D/g,
              ""
            )}?text=Bonjour`;

            return (
              <td
                key={h}
                className="orders-table__cell orders-table__cell--phone"
              >
                <div className="orders-table__phone-actions">
                  <button
                    type="button"
                    className={`orders-table__phone${isCopied ? " is-copied" : ""
                      }`}
                    onClick={() => handleCopyValue(valueToCopy, copyKey)}
                    title={
                      isCopied
                        ? "Numéro copié"
                        : "Cliquer pour copier le numéro"
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
                  <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="orders-table__whatsapp"
                    title="Ouvrir WhatsApp"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a6.963 6.963 0 0 0-6.962 6.962 6.971 6.971 0 0 0 1.399 4.115L2.323 22l4.282-1.123a6.966 6.966 0 0 0 10.064-6.755 6.972 6.972 0 0 0-6.973-6.961h.003m0-1.333C12.471 5.413 17.53 10.472 17.53 16.946c0 6.475-5.059 11.534-11.534 11.534a11.533 11.533 0 0 1-5.487-1.375L0 24l1.924-5.604a11.534 11.534 0 0 1 1.752-18.737A11.532 11.532 0 0 1 11.996 4.646Z" />
                    </svg>
                  </a>
                </div>
              </td>
            );
          }

          const extraClass =
            (isQuantityColumn ? " orders-table__cell--quantity" : "") +
            (isIdSheetColumn ? " orders-table__cell--idsheet" : "");

          return (
            <td
              key={h}
              className={`orders-table__cell${extraClass}`}
              data-label={
                isQuantityColumn
                  ? h || "Quantité"
                  : isIdSheetColumn
                    ? ""
                    : h || ""
              }
            >
              {trimmedDisplayText ? (
                isQuantityColumn ? (
                  <>
                    <span className="orders-qty-value">
                      {trimmedDisplayText}
                    </span>
                  </>
                ) : (
                  trimmedDisplayText
                )
              ) : (
                <span className="orders-table__muted">—</span>
              )}
            </td>
          );
        })}

        <td className="orders-table__cell orders-table__cell--total">
          <strong>{extractTotal(row)}</strong>
          <span className="orders-total-note">Prix livraison incluse</span>
        </td>

        <td className="orders-table__cell orders-table__cell--comment">
          <div className="orders-table__comment-wrapper">
            <label
              htmlFor={commentFieldId}
              className="orders-table__comment-label"
            >
              Commentaire (optionnel)
            </label>
            <button
              type="button"
              id={commentFieldId}
              className="orders-table__comment-trigger"
              onClick={handleCommentEdit}
              aria-haspopup="dialog"
            >
              {commentValue.trim() ? (
                <span className="orders-table__comment-content">
                  {commentValue}
                </span>
              ) : (
                <span className="orders-table__comment-placeholder">
                  Ajouter une remarque pour la livraison
                </span>
              )}
            </button>
          </div>
        </td>

        <td className="orders-table__cell orders-table__cell--delivery">
          <DeliveryCell
            row={row}
            orderDeliverySettings={orderDeliverySettings}
            setOrderDeliverySettings={setOrderDeliverySettings}
            deliveryPersons={deliveryPersons}
            preserveScroll={runWithScrollLock}
            debugLog={debugLog}
          />
        </td>

        <td className="orders-table__cell orders-table__cell--actions">
          <OrderActionButtons
            row={row}
            summary={summary}
            onUpdateStatus={onUpdateStatus}
            commentKey={commentKey}
            commentValue={commentValue}
            onCommentChange={onCommentChange}
            onSubmittingChange={setRowSubmitting}
          />
        </td>
        <td className="orders-table__cell orders-table__cell--status">
          <span className="orders-status">
            {getDisplayedOrderStatus(row)}
          </span>
          {String(row["__lastSyncError"] ?? "").trim() && (
            <small title={String(row["__lastSyncError"])}>
              Synchronisation en erreur
            </small>
          )}
        </td>
      </tr>
    );
  });

  const [error, setError] = React.useState<string | null>(null);
  const [sheetEditUrl, setSheetEditUrl] = React.useState<string>(SHEET_EDIT_URL);
  const [sheetLinkLoading, setSheetLinkLoading] = React.useState<boolean>(
    !SHEET_EDIT_URL
  );
  const [sheetLinkError, setSheetLinkError] = React.useState<boolean>(false);
  const [officialSyncLoading, setOfficialSyncLoading] =
    React.useState<boolean>(false);
  const [officialSyncMessage, setOfficialSyncMessage] =
    React.useState<string>("");
  const [query, setQuery] = React.useState<string>("");
  const [currentPage, setCurrentPage] = React.useState<number>(1);
  const [timeFilter, setTimeFilter] = React.useState<TimeFilter>("day");
  const [selectedDay, setSelectedDay] = React.useState<string>("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [productSort, setProductSort] = React.useState<string>("all");

  React.useEffect(() => {
    debugLog("Orders page mount", { scroll: getScrollSnapshot() });
  }, []);

  React.useEffect(() => {
    if (SHEET_EDIT_URL) return;

    let cancelled = false;
    const loadSheetEditUrl = async () => {
      try {
        const response = await apiFetch("/api/orders/sheet-link", {
          cache: "no-store",
        });
        const data = (await response.json()) as { url?: unknown };
        const url = typeof data.url === "string" ? data.url.trim() : "";
        if (
          !response.ok ||
          !/^https:\/\/docs\.google\.com\/spreadsheets\//i.test(url)
        ) {
          throw new Error("Lien Google Sheets invalide");
        }
        if (!cancelled) {
          setSheetEditUrl(url);
          setSheetLinkError(false);
        }
      } catch {
        if (!cancelled) setSheetLinkError(true);
      } finally {
        if (!cancelled) setSheetLinkLoading(false);
      }
    };

    void loadSheetEditUrl();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sélection multiple des commandes
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const isSelected = React.useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );
  // Sauvegarde / restauration simple de la position de scroll pour toutes les actions utilisateur
  const restoreScroll = React.useCallback((pos: { top: number; left: number }) => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: pos.top, left: pos.left, behavior: "auto" });
  }, []);

  const preserveScroll = React.useCallback(
    async (action: () => void | Promise<unknown>) => {
      const pos = getScrollSnapshot();
      try {
        await action();
      } finally {
        if (typeof window !== "undefined") {
          const restore = () => restoreScroll(pos);
          requestAnimationFrame(restore);
          setTimeout(restore, 120);
        }
      }
    },
    [restoreScroll]
  );

  const runWithScrollLock = React.useCallback(
    (action: () => void | Promise<unknown>) => {
      return preserveScroll(action);
    },
    [preserveScroll]
  );
  const toggleSelected = React.useCallback((id: string) => {
    runWithScrollLock(() => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    });
  }, [runWithScrollLock]);
  const clearSelection = React.useCallback(() => {
    runWithScrollLock(() => setSelectedIds(new Set()));
  }, [runWithScrollLock]);
  const selectAllOnPage = React.useCallback((rowsOnPage: OrderRow[]) => {
    runWithScrollLock(() => {
      const next = new Set<string>();
      rowsOnPage.forEach((row) => {
        const summary = extractOrderSummary(row);
        const id = summary.rowId || summary.displayRowLabel || "";
        if (id) next.add(id);
      });
      setSelectedIds(next);
    });
  }, [runWithScrollLock]);

  // Les brouillons restent limités à l'onglet courant et sont effacés à la déconnexion.
  const [orderComments, setOrderComments] = React.useState<
    Record<string, string>
  >(() => {
    try {
      const saved = sessionStorage.getItem("order-comments") || localStorage.getItem("order-comments");
      localStorage.removeItem("order-comments");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed === "object" && parsed !== null) {
          return parsed as Record<string, string>;
        }
      }
    } catch (error) {
      console.warn("Erreur lors du chargement des brouillons de commentaires");
    }
    return {};
  });

  // Met à jour l'état; la persistance disque est gérée séparément (debounce)
  const updateOrderComment = React.useCallback((key: string, value: string) => {
    setOrderComments((prev) => {
      const trimmed = value.trim();

      if (!trimmed) {
        if (!(key in prev)) return prev;
        const { [key]: _removed, ...rest } = prev;
        return rest;
      }

      if (prev[key] === value) return prev;
      debugLog("comment updateOrderComment", {
        key,
        length: value.length,
        preview: value.slice(0, 120),
        scroll: getScrollSnapshot(),
      });
      return { ...prev, [key]: value };
    });
  }, []);

  // Sauvegarde debouncée pour éviter les lags pendant la saisie
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof sessionStorage === "undefined") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        sessionStorage.setItem("order-comments", JSON.stringify(orderComments));
      } catch {
        console.warn("Erreur lors de la sauvegarde des brouillons de commentaires");
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [orderComments]);

  const [commentEditor, setCommentEditor] = React.useState<{
    isOpen: boolean;
    commentKey: string;
    value: string;
    summary: OrderSummary | null;
  }>({
    isOpen: false,
    commentKey: "",
    value: "",
    summary: null,
  });
  const commentDraftRef = React.useRef<string>("");

  // Conserver la position du scroll à l'ouverture du modal commentaire pour éviter que la page remonte
  const commentModalScrollRef = React.useRef({ x: 0, y: 0 });

  // État pour gérer les paramètres de livraison de chaque commande
  const [orderDeliverySettings, setOrderDeliverySettings] = React.useState<
    Record<
      string,
      {
        deliveryType: DeliveryType;
        deliveryPersonId: string | null;
      }
    >
  >({});

  // État pour gérer la liste des livreurs
  const [deliveryPersons, setDeliveryPersons] = React.useState<
    Array<{ id: string; name: string }>
  >([]);

  // Charger la liste des livreurs une seule fois
  React.useEffect(() => {
    const fetchDeliveryPersons = async () => {
      try {
        const response = await apiFetch("/api/orders/delivery-persons");
        const data = await response.json();
        if (data.success && Array.isArray(data.deliveryPersons)) {
          setDeliveryPersons(data.deliveryPersons);
        } else {
          setDeliveryPersons([]);
        }
      } catch (error) {
        console.warn("Erreur lors de la récupération des livreurs:", error);
        setDeliveryPersons([]);
      }
    };

    fetchDeliveryPersons();
  }, []);
  const handleCommentEditRequest = React.useCallback(
    (key: string, value: string, summary: OrderSummary) => {
      preserveScroll(() => {
        debugLog("comment modal open", {
          key,
          valuePreview: (value || "").slice(0, 120),
          summaryLabel: summary?.displayRowLabel,
          scroll: getScrollSnapshot(),
        });
        commentDraftRef.current = value || "";
        setCommentEditor({
          isOpen: true,
          commentKey: key,
          value,
          summary,
        });
      });
    },
    [preserveScroll]
  );

  const handleCommentModalChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const { value } = event.target;
      commentDraftRef.current = value;
      // Throttle logs pour éviter de spammer pendant la saisie
      if (value.length === 0 || value.length % 12 === 0) {
        debugLog("comment modal change", {
          length: value.length,
          preview: value.slice(0, 120),
          scroll: getScrollSnapshot(),
        });
      }
    },
    []
  );

  const handleCommentModalClose = React.useCallback(() => {
    const pos = getScrollSnapshot();
    debugLog("comment modal close", { scroll: pos });
    preserveScroll(() => {
      setCommentEditor({
        isOpen: false,
        commentKey: "",
        value: "",
        summary: null,
      });
      commentDraftRef.current = "";
    });
  }, [preserveScroll]);

  const handleCommentModalSave = React.useCallback(() => {
    const pos = getScrollSnapshot();
    const currentValue =
      commentDraftRef.current !== undefined && commentDraftRef.current !== null
        ? commentDraftRef.current
        : commentEditor.value;
    debugLog("comment modal save", {
      key: commentEditor.commentKey,
      length: currentValue.length,
      preview: currentValue.slice(0, 120),
      scroll: pos,
    });
    preserveScroll(() => {
      setCommentEditor((prev) => {
        if (!prev.isOpen) {
          return prev;
        }
        updateOrderComment(prev.commentKey, currentValue);
        return {
          isOpen: false,
          commentKey: "",
          value: "",
          summary: null,
        };
      });
      commentDraftRef.current = "";
    });
  }, [commentEditor.commentKey, commentEditor.value, preserveScroll, updateOrderComment]);

  // Restaurer la position du scroll après ouverture du modal commentaire
  React.useEffect(() => {
    if (!commentEditor.isOpen || typeof window === "undefined") return;
    const textarea = document.getElementById("comment-modal-field");
    if (textarea instanceof HTMLTextAreaElement) {
      commentDraftRef.current = textarea.value || "";
      textarea.focus({ preventScroll: true });
    }
  }, [commentEditor.isOpen]);

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

  React.useEffect(() => {
    if (!DEBUG_ORDERS) return;
    if (!selectedOrder) {
      debugLog("selectedOrder cleared", { scroll: getScrollSnapshot() });
      return;
    }
    const id =
      selectedOrder["id-sheet"] ||
      selectedOrder["ID"] ||
      selectedOrder["Num commande"] ||
      selectedOrder["Numero commande"] ||
      selectedOrder["Numéro commande"];
    debugLog("selectedOrder set", {
      id,
      name: selectedOrder["Nom du client"] || selectedOrder["nom_client"],
      scroll: getScrollSnapshot(),
    });
  }, [selectedOrder]);
  const [availableVariants, setAvailableVariants] = React.useState<
    Array<{
      name: string;
      quantity: number;
    }>
  >([]);
  const [loadingVariants, setLoadingVariants] = React.useState(false);

  const [communeSelector, setCommuneSelector] = React.useState<{
    isOpen: boolean;
    wilayaCode: string | number;
    wilayaName: string;
    onSelect: (commune: string) => void;
  }>({
    isOpen: false,
    wilayaCode: "",
    wilayaName: "",
    onSelect: () => { },
  });

  const productVariantCacheRef = React.useRef<
    Map<
      string,
      {
        name: string;
        code?: string;
        variants: Array<{ name: string; quantity: number }>;
      }
    >
  >(new Map());
  const productsCacheLoadedRef = React.useRef(false);
  const missingProductKeysRef = React.useRef(new Set<string>());

  const getCacheKeysForProduct = React.useCallback(
    (code?: string | null, name?: string | null) =>
      buildProductCacheKeys(code, name),
    []
  );

  const readProductFromCache = React.useCallback(
    (code?: string | null, name?: string | null) => {
      const cache = productVariantCacheRef.current;
      const keys = getCacheKeysForProduct(code, name);
      for (const key of keys) {
        const entry = cache.get(key);
        if (entry) {
          return entry;
        }
      }
      return null;
    },
    [getCacheKeysForProduct]
  );

  const registerProductsInCache = React.useCallback(
    (products: any[]) => {
      const cache = productVariantCacheRef.current;
      products.forEach((product) => {
        if (!product) return;
        const entry = {
          name: String(product.name ?? "").trim(),
          code:
            typeof product.code === "string" ? product.code.trim() : undefined,
          variants: Array.isArray(product.variants)
            ? product.variants.map((variant: any) => ({
              name: String(variant?.name ?? "").trim(),
              quantity: Number(variant?.quantity ?? 0) || 0,
            }))
            : [],
        };
        const keys = getCacheKeysForProduct(entry.code, entry.name);
        keys.forEach((key) => cache.set(key, entry));
      });
    },
    [getCacheKeysForProduct]
  );

  const ensureProductsCacheLoaded = React.useCallback(async () => {
    if (productsCacheLoadedRef.current) {
      return;
    }

    const response = await apiFetch("/api/products", {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) {
      console.warn("Chargement produits échoué:", response.status);
      productsCacheLoadedRef.current = true;
      return;
    }

    const products = await response.json();
    if (Array.isArray(products)) {
      registerProductsInCache(products);
    }
    productsCacheLoadedRef.current = true;
  }, [registerProductsInCache, token]);


  const applyStockUpdateToCache = React.useCallback(
    (options: {
      code?: string;
      name?: string;
      variant: string;
      finalQuantity?: number;
      decrementBy?: number;
    }) => {
      const cache = productVariantCacheRef.current;
      const keys = getCacheKeysForProduct(options.code, options.name);
      const normalizedVariant = normalizeVariantNameForCache(options.variant);
      let impacted = false;

      keys.forEach((key) => {
        const entry = cache.get(key);
        if (!entry) return;
        entry.variants = entry.variants.map((variant) => {
          if (
            normalizeVariantNameForCache(variant.name) === normalizedVariant
          ) {
            const current = Number(variant.quantity) || 0;
            const finalQuantityProvided =
              options.finalQuantity !== undefined
                ? Number(options.finalQuantity)
                : undefined;
            const decrementByValue =
              options.decrementBy !== undefined
                ? Number(options.decrementBy)
                : 0;
            const rawNext =
              finalQuantityProvided !== undefined &&
                Number.isFinite(finalQuantityProvided)
                ? finalQuantityProvided
                : current -
                (Number.isFinite(decrementByValue) ? decrementByValue : 0);
            const next = Number.isFinite(rawNext) ? rawNext : current;
            impacted = true;
            return { ...variant, quantity: next };
          }
          return variant;
        });
      });

      if (impacted && variantModalOpen.isOpen && variantModalOpen.orderRow) {
        const modalCode = extractProductCode(variantModalOpen.orderRow);
        const modalKeys = getCacheKeysForProduct(
          modalCode,
          variantModalOpen.productName
        );
        const intersects = keys.some((key) => modalKeys.includes(key));
        if (intersects) {
          const modalEntry = readProductFromCache(
            modalCode,
            variantModalOpen.productName
          );
          if (modalEntry) {
            setAvailableVariants(
              modalEntry.variants.map((variant) => ({ ...variant }))
            );
          }
        }
      }

      return impacted;
    },
    [
      getCacheKeysForProduct,
      readProductFromCache,
      variantModalOpen.isOpen,
      variantModalOpen.orderRow,
      variantModalOpen.productName,
    ]
  );

  const resolveProductForStockPayload = React.useCallback(
    async (payload: {
      code?: string;
      name?: string;
      variant: string;
      quantity: number;
    }) => {
      const normalizedPayload = { ...payload };

      const candidateNames = new Set<string>();
      if (normalizedPayload.name) {
        candidateNames.add(normalizedPayload.name);
        const { baseName } = splitProductLabel(normalizedPayload.name);
        if (baseName && baseName !== normalizedPayload.name) {
          candidateNames.add(baseName);
        }
      }

      const attemptResolve = () => {
        if (!candidateNames.size) {
          const entry = readProductFromCache(
            normalizedPayload.code,
            normalizedPayload.name
          );
          return entry ? { entry } : null;
        }

        for (const nameCandidate of candidateNames) {
          const entry = readProductFromCache(
            normalizedPayload.code,
            nameCandidate
          );
          if (entry) {
            return { entry };
          }
        }
        return null;
      };

      let resolved = attemptResolve();
      if (!resolved) {
        try {
          await ensureProductsCacheLoaded();
        } catch (error) {
          console.error(
            "Erreur lors du chargement du cache produits pour la décrémentation:",
            error
          );
        }
        resolved = attemptResolve();
      }

      if (!resolved) {
        return normalizedPayload;
      }

      const { entry } = resolved;
      if (!normalizedPayload.code && entry.code) {
        normalizedPayload.code = entry.code;
      }
      if (entry.name && normalizedPayload.name) {
        const entryNameNormalized = normalizeProductNameForCache(entry.name);
        const payloadNameNormalized = normalizeProductNameForCache(
          normalizedPayload.name
        );
        if (entryNameNormalized !== payloadNameNormalized) {
          normalizedPayload.name = entry.name;
        }
      } else if (!normalizedPayload.name && entry.name) {
        normalizedPayload.name = entry.name;
      }

      const normalizedVariant = normalizeVariantNameForCache(
        normalizedPayload.variant
      );
      const exactVariantMatch = entry.variants.find(
        (variant) =>
          normalizeVariantNameForCache(variant.name) === normalizedVariant
      );
      if (exactVariantMatch) {
        normalizedPayload.variant = exactVariantMatch.name;
        return normalizedPayload;
      }

      if (normalizedVariant && normalizedVariant !== "default") {
        const partialMatch = entry.variants.find((variant) => {
          const candidate = normalizeVariantNameForCache(variant.name);
          return (
            candidate.includes(normalizedVariant) ||
            normalizedVariant.includes(candidate)
          );
        });
        if (partialMatch) {
          normalizedPayload.variant = partialMatch.name;
        }
      }

      return normalizedPayload;
    },
    [ensureProductsCacheLoaded, readProductFromCache]
  );

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

    const updatedRow = rows.find((row) => getRowIdentifier(row) === identifier);

    if (!updatedRow || updatedRow === selectedOrder) {
      return;
    }

    setSelectedOrder(updatedRow);
  }, [getRowIdentifier, rows, selectedOrder]);

  const selectedSummary = React.useMemo(
    () => (selectedOrder ? extractOrderSummary(selectedOrder) : null),
    [selectedOrder]
  );

  const selectedOrderCommentKey = selectedSummary
    ? resolveCommentKey(
      selectedSummary,
      selectedSummary.displayRowLabel ||
      selectedSummary.rowId ||
      "selected-order"
    )
    : "";
  const selectedOrderCommentValue = selectedOrderCommentKey
    ? orderComments[selectedOrderCommentKey] ?? ""
    : "";

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

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [selectedOrder]);

  const hasOverlayOpen = Boolean(
    selectedOrder || commentEditor.isOpen || communeSelector.isOpen
  );

  // overlay scroll-lock removed to avoid scroll jumps

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

  // Debug global clicks + scroll positions to trace unexpected jumps
  // Debug listeners
  React.useEffect(() => {
    if (!DEBUG_ORDERS || typeof document === "undefined") return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      debugLog("document click", {
        tag: target?.tagName,
        id: target?.id,
        className: target?.className,
        ariaLabel: target?.getAttribute?.("aria-label"),
        text: (target?.textContent || "").trim().slice(0, 120),
        scroll: getScrollSnapshot(),
      });
    };
    const handleScroll = () => {
      debugLog("scroll", getScrollSnapshot());
    };
    document.addEventListener("click", handleClick, { capture: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    debugLog("debug listeners attached", getScrollSnapshot());
    return () => {
      document.removeEventListener("click", handleClick, { capture: true } as any);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

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
  const sheetPollingDisabledRef = React.useRef(false);
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
        throw new Error(
          "La synchronisation est indisponible. Rechargez la page avant de modifier une commande."
        );
      }
      if (!rowId) {
        throw new Error(
          "Identifiant de commande manquant pour la mise à jour du statut"
        );
      }
      try {
        const res = await apiFetch(SHEET_SYNC_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rowId,
            status,
            tracking: context?.tracking,
            row: context?.row,
            deliveryType: context?.deliveryType,
            deliveryPersonId: context?.deliveryPersonId,
          }),
        });
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        if (
          data &&
          typeof data === "object" &&
          data.partialSuccess === true
        ) {
          window.alert(
            data.message ||
            "La commande est sauvegardée, mais une synchronisation secondaire a échoué."
          );
          return data;
        }
        if (!res.ok || (data && typeof data === "object" && data.success === false)) {
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
      const res = await apiFetch(buildCsvUrl(), { cache: "no-store" });
      if (!res.ok) {
        const requestError = new Error(`HTTP ${res.status}`) as Error & {
          status?: number;
        };
        requestError.status = res.status;
        throw requestError;
      }
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

        const normalizeHeaderForOrder = (value: string) =>
          normalizeHeader(value).replace(/[^a-z0-9]+/g, "");

        const desiredHeaderGroups: string[][] = [
          ["Nom du client", "Nom client", "Client", "Nom"],
          ["Numero", "Numéro", "Num", "Telephone", "Téléphone", "Tel", "Phone"],
          ["ID", "Identifiant"],
          ["id-sheet", "Sheet", "Row"],
          [
            "Produit",
            "Product",
            "Article",
            "Nom du produit",
            "Produit commande",
          ],
          ["Quantité", "Quantite", "Qte", "Qté"],
          ["Wilaya"],
          ["Commune", "Ville"],
          ["Variante", "Variation", "Taille", "Variante produit", "Option"],
          [
            "Type de livraison",
            "Type livraison",
            "Mode de livraison",
            "Livraison",
          ],
        ];

        const normalizedUniqueHeaders = uniqueHeaders.map((header) => ({
          header,
          normalized: normalizeHeaderForOrder(header),
        }));

        const selectedHeaders: string[] = [];
        const seenNormalizedHeaders = new Set<string>();

        desiredHeaderGroups.forEach((group) => {
          const normalizedTargets = group
            .map((value) => normalizeHeaderForOrder(value))
            .filter(Boolean);
          const match = normalizedUniqueHeaders.find(
            (entry) =>
              normalizedTargets.includes(entry.normalized) &&
              !seenNormalizedHeaders.has(entry.normalized)
          );

          if (match) {
            selectedHeaders.push(match.header);
            seenNormalizedHeaders.add(match.normalized);
          } else if (group[0]) {
            const normalizedFallback = normalizeHeaderForOrder(group[0]);
            if (
              normalizedFallback &&
              !seenNormalizedHeaders.has(normalizedFallback)
            ) {
              selectedHeaders.push(group[0]);
              seenNormalizedHeaders.add(normalizedFallback);
            }
          }
        });

        setHeaders(selectedHeaders.length ? selectedHeaders : uniqueHeaders);
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

            ensureCanonicalField(
              "Type de livraison",
              (normalizedKey, tokens) => {
                const hasType = tokens.some(
                  (token) => token === "type" || token === "mode"
                );
                const hasLivraison = tokens.some(
                  (token) => token === "livraison" || token === "delivery"
                );
                if (hasType && hasLivraison) return true;
                return (
                  normalizedKey.includes("livraison") &&
                  (normalizedKey.includes("type") ||
                    normalizedKey.includes("mode") ||
                    normalizedKey.includes("option"))
                );
              }
            );

            ensureCanonicalField("Tracking", (normalizedKey, tokens) => {
              if (tokens.some((token) => token === "tracking")) return true;
              if (tokens.some((token) => token === "suivi")) return true;
              if (tokens.some((token) => token === "awb")) return true;
              return (
                normalizedKey.includes("tracking") ||
                normalizedKey.includes("suivi") ||
                normalizedKey.includes("awb")
              );
            });

            ensureCanonicalField("Référence", (normalizedKey, tokens) => {
              if (tokens.some((token) => token === "reference")) return true;
              if (tokens.some((token) => token === "ref")) return true;
              return (
                normalizedKey.includes("reference") ||
                normalizedKey === "ref" ||
                normalizedKey.includes("commande_ref")
              );
            });

            return obj;
          })
          .filter((row): row is OrderRow => row !== null);
        let hydratedRows = mapped;
        try {
          const rowIds = mapped
            .map((row) => String(row["id-sheet"] ?? row["ID"] ?? "").trim())
            .filter(Boolean);
          if (rowIds.length > 0) {
            const metadataResponse = await apiFetch("/api/orders/metadata", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ rowIds }),
            });
            const metadataPayload = await metadataResponse.json().catch(() => ({}));
            if (metadataResponse.ok && metadataPayload?.success === true) {
              const metadataByRowId = new Map<string, any>();
              const persistedSettings: Record<
                string,
                { deliveryType: DeliveryType; deliveryPersonId: string | null }
              > = {};
              (Array.isArray(metadataPayload.orders)
                ? metadataPayload.orders
                : []
              ).forEach((metadata: any) => {
                const metadataRowId = String(metadata?.rowId ?? "").trim();
                if (!metadataRowId) return;
                metadataByRowId.set(metadataRowId, metadata);
                const persistedType: DeliveryType =
                  metadata.deliveryType === "api_sook" ||
                  metadata.deliveryType === "livreur"
                    ? metadata.deliveryType
                    : "api_dhd";
                persistedSettings[metadataRowId] = {
                  deliveryType: persistedType,
                  deliveryPersonId:
                    persistedType === "livreur" && metadata.deliveryPersonId
                      ? String(metadata.deliveryPersonId)
                      : null,
                };
              });
              setOrderDeliverySettings((previous) => ({
                ...previous,
                ...persistedSettings,
              }));
              hydratedRows = mapped.map((row) => {
                const metadata = metadataByRowId.get(
                  String(row["id-sheet"] ?? row["ID"] ?? "").trim()
                );
                if (!metadata) return row;
                return {
                  ...row,
                  __carrierStatus: metadata.carrierStatus ?? "",
                  __carrierStatusUpdatedAt:
                    metadata.carrierStatusUpdatedAt ?? "",
                  __lastSyncError: metadata.lastSyncError ?? "",
                  Tracking: metadata.tracking || row["Tracking"] || "",
                  etat: metadata.status || row["etat"] || "new",
                };
              });
            }
          }
        } catch (metadataError) {
          console.warn("Metadonnees de livraison indisponibles:", metadataError);
        }
        setRows(hydratedRows);
      }
    } catch (e: any) {
      if (e?.status === 404) {
        sheetPollingDisabledRef.current = true;
      }
      if (!cancelledRef.current) {
        setError(
          e?.status === 404
            ? "Le backend déployé est trop ancien et ne fournit pas la route des commandes. Redéployez le backend puis rechargez cette page."
            : e?.message || "Erreur inconnue"
        );
      }
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
      if (cancelledRef.current || sheetPollingDisabledRef.current) return;
      intervalId = setInterval(() => {
        if (sheetPollingDisabledRef.current) {
          if (intervalId) clearInterval(intervalId);
          intervalId = undefined;
          return;
        }
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

  const handleRefreshOfficialStatuses = React.useCallback(async () => {
    if (officialSyncLoading) return;

    const ordersToSync = rows
      .map((row) => {
        const rowId = String(row["id-sheet"] ?? row["ID"] ?? "").trim();
        const tracking = String(
          row["Tracking"] ?? row["tracking"] ?? ""
        ).trim();
        const settings = orderDeliverySettings[rowId];
        if (
          !rowId ||
          !tracking ||
          !settings ||
          (settings.deliveryType !== "api_dhd" &&
            settings.deliveryType !== "api_sook")
        ) {
          return null;
        }
        return {
          rowId,
          tracking,
          reference: extractReference(row) || undefined,
          currentStatus: String(row["etat"] ?? "").trim() || undefined,
          deliveryType: settings.deliveryType,
        };
      })
      .filter((order): order is NonNullable<typeof order> => order !== null)
      .slice(0, 1000);

    if (ordersToSync.length === 0) {
      setOfficialSyncMessage(
        "Aucune commande DHD/Sook avec tracking n'est disponible à synchroniser."
      );
      return;
    }

    setOfficialSyncLoading(true);
    setOfficialSyncMessage("");
    try {
      const response = await apiFetch("/api/orders/sync-statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: ordersToSync }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 409) {
        setOfficialSyncMessage(
          "Une synchronisation est déjà en cours. Les données vont être rechargées."
        );
        await loadSheetData(false);
        return;
      }
      if (!response.ok || data?.success !== true) {
        throw new Error(data?.message || `HTTP ${response.status}`);
      }

      const updates = Array.isArray(data.updates) ? data.updates.length : 0;
      const errors = Array.isArray(data.errors) ? data.errors.length : 0;
      const notFound = Array.isArray(data.notFound) ? data.notFound.length : 0;
      setOfficialSyncMessage(
        `Synchronisation terminée : ${updates} statut(s) lu(s), ${errors} erreur(s), ${notFound} tracking(s) introuvable(s).`
      );
      await loadSheetData(false);
    } catch (error) {
      setOfficialSyncMessage(
        error instanceof Error
          ? `Synchronisation impossible : ${error.message}`
          : "Synchronisation impossible."
      );
    } finally {
      setOfficialSyncLoading(false);
    }
  }, [
    loadSheetData,
    officialSyncLoading,
    orderDeliverySettings,
    rows,
  ]);


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
        if (context.persist !== false) {
          await syncStatus(rowId, status, context);
        }
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


  const handleVariantClick = useCallback(
    async (row: OrderRow) => {
      const productName = String(row["Produit"] || "").trim();
      const rawVariant = String(
        row["Variante"] || row["Variation"] || row["Taille"] || ""
      ).trim();
      const extractedVariant = extractVariantValue(row);
      const currentVariant = (
        rawVariant && isMeaningfulVariantName(rawVariant)
          ? rawVariant
          : extractedVariant && isMeaningfulVariantName(extractedVariant)
            ? extractedVariant
            : rawVariant || extractedVariant || "default"
      ).trim();

      if (!productName) {
        alert("Aucun produit trouvé pour cette commande");
        return;
      }

      await preserveScroll(() =>
        setVariantModalOpen({
          isOpen: true,
          orderRow: row,
          productName,
          currentVariant,
        })
      );
      const productCode = extractProductCode(row);
      const cacheKeys = getCacheKeysForProduct(productCode, productName);
      const cachedEntry = readProductFromCache(productCode, productName);

      if (DEBUG_ORDERS) {
        console.log("[VariantModal] open", {
          rowId: row["id-sheet"] || row["ID"] || "",
          productName,
          productCode,
          currentVariant,
          cacheKeys,
        });
      }

      if (cachedEntry) {
        if (DEBUG_ORDERS) {
          console.log("[VariantModal] cache hit", {
            productCode,
            productName,
            variants: cachedEntry.variants,
          });
        }
        setAvailableVariants(
          cachedEntry.variants.map((variant) => ({ ...variant }))
        );
        setLoadingVariants(false);
        cacheKeys.forEach((key) => missingProductKeysRef.current.delete(key));
        return;
      }

      const alreadyMarkedMissing = cacheKeys.every((key) =>
        missingProductKeysRef.current.has(key)
      );

      if (productsCacheLoadedRef.current && alreadyMarkedMissing) {
        console.warn("[VariantModal] already marked missing", {
          productCode,
          productName,
          cacheKeys,
        });
        setAvailableVariants([]);
        setLoadingVariants(false);
        alert("Aucune variante trouvée pour ce produit");
        return;
      }

      setLoadingVariants(true);
      let loadError: unknown = null;
      try {
        await ensureProductsCacheLoaded();
      } catch (error) {
        loadError = error;
        console.error("Erreur lors du chargement des variantes:", error);
        alert("Erreur lors du chargement des variantes");
        setAvailableVariants([]);
      } finally {
        setLoadingVariants(false);
      }

      if (loadError) {
        return;
      }

      const refreshedEntry = readProductFromCache(productCode, productName);
      if (refreshedEntry && refreshedEntry.variants.length > 0) {
        if (DEBUG_ORDERS) {
          console.log("[VariantModal] refreshed variants", {
            productCode,
            productName,
            variants: refreshedEntry.variants,
          });
        }
        setAvailableVariants(
          refreshedEntry.variants.map((variant) => ({ ...variant }))
        );
        cacheKeys.forEach((key) => missingProductKeysRef.current.delete(key));
      } else {
        console.warn("[VariantModal] no variants found after refresh", {
          productCode,
          productName,
        });
        setAvailableVariants([]);
        cacheKeys.forEach((key) => missingProductKeysRef.current.add(key));
        alert("Aucune variante trouvée pour ce produit");
      }
    },
    [
      ensureProductsCacheLoaded,
      getCacheKeysForProduct,
      missingProductKeysRef,
      readProductFromCache,
      preserveScroll,
    ]
  );

  const handleVariantSelect = useCallback(
    async (selectedVariant: string) => {
      if (!variantModalOpen.orderRow) return;

      const row = variantModalOpen.orderRow;
      const rowId = String(row["id-sheet"] || row["ID"] || "").trim();

      if (!rowId) {
        alert("Impossible d'identifier la commande");
        return;
      }

      try {
        const trimmedVariant = selectedVariant.trim() || "default";
        const updatedRow: OrderRow = { ...row };
        let variantKeyUpdated = false;
        for (const key of Object.keys(updatedRow)) {
          if (VARIANT_KEY_CANDIDATE_SET.has(normalizeKey(key))) {
            updatedRow[key] = trimmedVariant;
            variantKeyUpdated = true;
          }
        }
        if (!variantKeyUpdated) {
          updatedRow["Variante"] = trimmedVariant;
        }
        // Mettre à jour la variante dans le Google Sheet
        await syncStatus(rowId, getRowStatus(row), {
          previousStatus: getRowStatus(row),
          row: updatedRow,
        });

        // Mettre à jour l'état local
        setRows((prevRows) =>
          prevRows.map((r) => {
            const currentRowId = String(r["id-sheet"] || r["ID"] || "").trim();
            if (currentRowId === rowId) {
              const nextRow: OrderRow = { ...r };
              let updated = false;
              for (const key of Object.keys(nextRow)) {
                if (VARIANT_KEY_CANDIDATE_SET.has(normalizeKey(key))) {
                  nextRow[key] = trimmedVariant;
                  updated = true;
                }
              }
              if (!updated) {
                nextRow["Variante"] = trimmedVariant;
              }
              return nextRow;
            }
            return r;
          })
        );

        // Fermer le modal
        await preserveScroll(() =>
          setVariantModalOpen({
            isOpen: false,
            orderRow: null,
            productName: "",
            currentVariant: trimmedVariant,
          })
        );

        // Afficher un message de succès
        const toast = document.createElement("div");
        toast.textContent = `✅ Variante mise à jour vers "${trimmedVariant}"`;
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
    },
    [preserveScroll, syncStatus, variantModalOpen.orderRow]
  );

  const handleDeliveryTypeChange = React.useCallback(
    async (row: OrderRow, nextMode: CustomerDeliveryMode) => {
      const rowId = String(row["id-sheet"] || row["ID"] || "").trim();
      if (!rowId) {
        alert("Impossible d'identifier la commande");
        return;
      }

      debugLog("handleDeliveryTypeChange start", {
        rowId,
        nextMode,
        scroll: getScrollSnapshot(),
      });
      const nextLabel =
        DELIVERY_MODE_LABELS[nextMode] ?? DELIVERY_MODE_LABELS.a_domicile;
      const currentStatus = getRowStatus(row) as SheetStatus;
      const updatedRow = applyDeliveryModeToRow(row, nextLabel);

      try {
        await syncStatus(rowId, currentStatus, {
          previousStatus: currentStatus,
          row: updatedRow,
          deliveryType: nextMode as any,
        });

        setRows((prevRows) =>
          prevRows.map((existingRow) => {
            const existingRowId = String(
              existingRow["id-sheet"] || existingRow["ID"] || ""
            ).trim();
            if (existingRowId === rowId) {
              return applyDeliveryModeToRow(existingRow, nextLabel);
            }
            return existingRow;
          })
        );
        setSelectedOrder((prev) => {
          if (!prev) return prev;
          const selectedRowId = String(
            prev["id-sheet"] || prev["ID"] || ""
          ).trim();
          if (selectedRowId === rowId) {
            return applyDeliveryModeToRow(prev, nextLabel);
          }
          return prev;
        });

        debugLog("handleDeliveryTypeChange success", {
          rowId,
          nextMode,
          scroll: getScrollSnapshot(),
        });

        const toast = document.createElement("div");
        toast.textContent = `Type de livraison mis à jour : "${nextLabel}"`;
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
        }, 2400);
      } catch (error) {
        console.error(
          "Erreur lors de la mise à jour du type de livraison",
          error
        );
        alert("Impossible de mettre à jour le type de livraison");
        debugLog("handleDeliveryTypeChange error", {
          rowId,
          nextMode,
          error: String(error),
          scroll: getScrollSnapshot(),
        });
      } finally {
        // no manual scroll restore
      }
    },
    [syncStatus]
  );

  const handleWilayaCommuneChange = React.useCallback(
    async (row: OrderRow, wilaya?: string, commune?: string) => {
      const rowId = String(row["id-sheet"] || row["ID"] || "").trim();
      if (!rowId) {
        alert("Impossible d'identifier la commande");
        return;
      }

      if (!wilaya && !commune) {
        return;
      }

      // Si on change la wilaya, vérifier si la commune actuelle existe dans la nouvelle wilaya
      let finalCommune = commune;
      if (wilaya && !commune) {
        const newWilayaCode = getWilayaIdByName(wilaya);
        const currentCommune = row["Commune"] || row["commune"] || "";
        const communesForNewWilaya = getCommunesByWilaya(newWilayaCode);
        const currentCommuneFr = getFrenchForDisplay(currentCommune, row["Wilaya"] || "");
        const communeExists = communesForNewWilaya.some(
          c => c.fr === currentCommuneFr || c.ar === currentCommune
        );
        // Si la commune actuelle n'existe pas dans la nouvelle wilaya, on la réinitialise
        if (!communeExists && currentCommune) {
          finalCommune = "";
        } else if (communeExists) {
          finalCommune = currentCommuneFr || currentCommune;
        }
      }

      try {
        const response = await apiFetch("/api/orders/wilaya-commune", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            rowId,
            wilaya,
            commune: finalCommune,
            row,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message || "Erreur lors de la mise à jour"
          );
        }

        // Mettre à jour les données locales
        setRows((prevRows) =>
          prevRows.map((existingRow) => {
            const existingRowId = String(
              existingRow["id-sheet"] || existingRow["ID"] || ""
            ).trim();
            if (existingRowId === rowId) {
              const updated = { ...existingRow };
              if (wilaya) updated["Wilaya"] = wilaya;
              if (finalCommune !== undefined) updated["Commune"] = finalCommune || "";
              return updated;
            }
            return existingRow;
          })
        );
        setSelectedOrder((prev) => {
          if (!prev) return prev;
          const selectedRowId = String(
            prev["id-sheet"] || prev["ID"] || ""
          ).trim();
          if (selectedRowId === rowId) {
            const updated = { ...prev };
            if (wilaya) updated["Wilaya"] = wilaya;
            if (finalCommune !== undefined) updated["Commune"] = finalCommune || "";
            return updated;
          }
          return prev;
        });

        const toast = document.createElement("div");
        toast.textContent = wilaya && finalCommune 
          ? `Wilaya et commune mises à jour`
          : wilaya 
          ? `Wilaya mise à jour`
          : `Commune mise à jour`;
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
        }, 2400);
      } catch (error) {
        console.error("Erreur lors de la mise à jour de wilaya/commune", error);
        alert(
          error instanceof Error
            ? error.message
            : "Impossible de mettre à jour la wilaya/commune"
        );
      }
    },
    [token]
  );

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

  // Liste des produits uniques (sans variantes) pour le tri
  const availableProducts = React.useMemo(() => {
    const productSet = new Set<string>();
    rows.forEach((row) => {
      const productName = extractProductNameOnly(row);
      if (productName) {
        productSet.add(productName);
      }
    });
    return Array.from(productSet).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = React.useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();
    const normalizedStatus = statusFilter.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (trimmedQuery) {
          const matchesQuery = searchableHeaders
            .filter((k) => k in row)
            .some((key) =>
              (row[key] || "").toLowerCase().includes(trimmedQuery)
            );
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

        // Filtrer par produit si un produit est sélectionné
        if (productSort !== "all") {
          const rowProductName = extractProductNameOnly(row);
          if (rowProductName !== productSort) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const dateA = extractRowDate(a);
        const dateB = extractRowDate(b);

        // If both have dates, sort by date descending (latest first)
        if (dateA && dateB) {
          return dateB.getTime() - dateA.getTime();
        }

        // If only one has a date, put the one with date first
        if (dateA && !dateB) return -1;
        if (!dateA && dateB) return 1;

        // If neither has a date, maintain original order
        return 0;
      });
  }, [
    rows,
    query,
    searchableHeaders,
    statusFilter,
    timeFilter,
    activeTimeRange,
    productSort,
  ]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [timeFilter, selectedDay, statusFilter, productSort]);

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
            <button
              type="button"
              className="orders-link"
              disabled={!sheetEditUrl}
              title={
                sheetLinkError
                  ? "Lien Google Sheets indisponible"
                  : "Ouvrir la feuille Google dans un nouvel onglet"
              }
              onClick={() => {
                if (sheetEditUrl) {
                  window.open(sheetEditUrl, "_blank", "noopener,noreferrer");
                }
              }}
            >
              {sheetLinkLoading
                ? "Préparation de la feuille…"
                : "Ouvrir la feuille Google"}
            </button>
            <button
              type="button"
              className="orders-link"
              disabled={officialSyncLoading}
              onClick={() => void handleRefreshOfficialStatuses()}
              title="Lire maintenant les statuts officiels DHD/Sook et mettre à jour la feuille"
            >
              {officialSyncLoading
                ? "Synchronisation…"
                : "Actualiser les statuts DHD"}
            </button>
          </div>

          {officialSyncMessage && (
            <p className="orders-state" role="status">
              {officialSyncMessage}
            </p>
          )}

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

            <span className="orders-filter-label orders-filter-label--status">
              Produit :
            </span>
            <select
              value={productSort}
              onChange={(e) => setProductSort(e.target.value)}
              className="orders-select"
            >
              <option value="all">Tous les produits</option>
              {availableProducts.map((product) => (
                <option key={product} value={product}>
                  {product}
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
                const statusLabel = getDisplayedOrderStatus(row) || "Sans statut";
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
                    onClick={() => preserveScroll(() => setSelectedOrder(row))}
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
              {paginatedRows.length > 0 && (
                <div className="orders-bulkbar">
                  <label className="orders-bulkbar__selectall">
                    <input
                      type="checkbox"
                      onChange={(e) => {
                        if (e.target.checked) {
                          selectAllOnPage(paginatedRows);
                        } else {
                          clearSelection();
                        }
                      }}
                      checked={
                        paginatedRows.every((row) => {
                          const s = extractOrderSummary(row);
                          const id = s.rowId || s.displayRowLabel || "";
                          return id && selectedIds.has(id);
                        }) && paginatedRows.length > 0
                      }
                    />
                    Sélectionner cette page
                  </label>
                  <span className="orders-bulkbar__count">
                    {selectedIds.size} sélectionnée(s)
                  </span>
                  <div className="orders-bulkbar__actions">
                    <button
                      type="button"
                      className="orders-button orders-button--primary"
                      disabled={selectedIds.size === 0}
                      onClick={async () => {
                        if (selectedIds.size === 0) return;
                        if (
                          !window.confirm(
                            `Valider ${selectedIds.size} commande(s) ?`
                          )
                        )
                          return;
                        for (const row of paginatedRows) {
                          const s = extractOrderSummary(row);
                          const id = s.rowId || s.displayRowLabel || "";
                          if (!id || !selectedIds.has(id)) continue;
                          try {
                            // Choisir l'API selon le paramètre de livraison de la commande
                            const currentRowId = String(
                              row["id-sheet"] || row["ID"] || ""
                            );
                            const settings = orderDeliverySettings[
                              currentRowId
                            ] || {
                              deliveryType: "api_dhd",
                              deliveryPersonId: null,
                            };
                            if (settings.deliveryType === "livreur") {
                              // Assignation livreur: mettre statut 'Assigné' sans appeler API externe
                              await handleUpdateRowStatus(s.rowId, "Assigné", {
                                previousStatus: s.status,
                                row,
                                deliveryType: "livreur",
                                deliveryPersonId:
                                  settings.deliveryPersonId || undefined,
                              });
                              continue;
                            }
                            // Calcul montant similaire au flux individuel
                            const quantityForTotal =
                              parsePositiveIntegerQuantity(
                                row["Quantité"] ||
                                row["Quantite"] ||
                                row["Qte"]
                              );
                            const unitPriceForTotal = (() => {
                              const candidates = [
                                "Prix unitaire",
                                "Prix",
                                "PrixU",
                                "PU",
                                "Prix U",
                              ];
                              for (const key of candidates) {
                                if (key in row) {
                                  const parsed = parseLocaleAmount(row[key]);
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
                                  const parsed = parseLocaleAmount(row[key]);
                                  if (parsed !== null) return parsed;
                                }
                              }
                              return null;
                            })();
                            const computedFromUnit =
                              unitPriceForTotal !== null &&
                                quantityForTotal !== null
                                ? unitPriceForTotal * quantityForTotal
                                : null;
                            const montantNumber =
                              amountFromSheet ??
                              computedFromUnit;
                            const wilayaCode = Number(
                              getWilayaIdByName(row["Wilaya"] as any)
                            );
                            const communeResolved = resolveCommuneName(
                              (row["Commune"] as any) || "",
                              (row["Wilaya"] as any) || "",
                              wilayaCode
                            );
                            const remarkFromSheet = (() => {
                              const remarkKeys = [
                                "Remarque",
                                "Remarques",
                                "Commentaire",
                                "Commentaires",
                                "Note",
                                "Notes",
                                "Observation",
                                "Observations",
                              ];
                              for (const key of remarkKeys) {
                                const val = row[key];
                                if (val === undefined || val === null) continue;
                                const t = String(val).trim();
                                if (t) return t;
                              }
                              return "";
                            })();
                            const finalRemark =
                              (
                                orderComments[
                                resolveCommentKey(
                                  s,
                                  s.rowId || s.displayRowLabel || ""
                                )
                                ] || ""
                              ).trim() || remarkFromSheet;
                            const address = String(
                              row["Adresse"] ??
                              row["adresse"] ??
                              row["Address"] ??
                              ""
                            ).trim();
                            const bulkValidationErrors: string[] = [];
                            if (!s.rowId) bulkValidationErrors.push("identifiant de ligne");
                            if (!(s.name || s.rawName)) {
                              bulkValidationErrors.push("nom du client");
                            }
                            if (!/^\d{9,10}$/.test(s.phoneDial)) {
                              bulkValidationErrors.push("telephone valide");
                            }
                            if (!address) bulkValidationErrors.push("adresse");
                            if (
                              !Number.isInteger(wilayaCode) ||
                              wilayaCode < 1 ||
                              wilayaCode > 58
                            ) {
                              bulkValidationErrors.push("wilaya");
                            }
                            if (!communeResolved) {
                              bulkValidationErrors.push("commune");
                            }
                            if (
                              montantNumber === null ||
                              !Number.isFinite(montantNumber) ||
                              montantNumber < 0
                            ) {
                              bulkValidationErrors.push("montant total");
                            }
                            if (bulkValidationErrors.length > 0) {
                              alert(
                                `Commande ${s.displayRowLabel || s.rowId || "sélectionnée"} non envoyée. Champs manquants ou invalides : ${bulkValidationErrors.join(
                                  ", "
                                )}.`
                              );
                              continue;
                            }
                            const secondaryPhone = normalizePhone(
                              firstNonEmptyRowValue(row, [
                                "Numero 2",
                                "Numéro 2",
                                "Téléphone 2",
                                "Telephone 2",
                                "Tel 2",
                                "Phone 2",
                              ])
                            );
                            const communeForApi = String(communeResolved || "")
                              .normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "");
                            const payload = {
                              reference: extractReference(row) || s.rowId,
                              nom_client: s.name || s.rawName || "",
                              telephone: s.phoneDial || "",
                              telephone_2: secondaryPhone,
                              adresse: address,
                              code_postal: firstNonEmptyRowValue(row, [
                                "Code postal",
                                "Code Postal",
                                "code_postal",
                                "CP",
                              ]),
                              code_wilaya: wilayaCode,
                              montant: String(Math.round(montantNumber as number)),
                              type: "1",
                              stop_desk:
                                getDeliveryModeFromRow(row) === "stop_desk"
                                  ? 1
                                  : 0,
                              stock: "0",
                              quantite: quantityForTotal ?? undefined,
                              fragile: readBooleanRowFlag(row, [
                                "Fragile",
                                "fragile",
                              ]),
                              produit:
                                extractProductLabel(row) ||
                                (row["Produit"] as any) ||
                                "",
                              produit_a_recuperer: firstNonEmptyRowValue(row, [
                                "Produit à récupérer",
                                "Produit a recuperer",
                                "produit_a_recuperer",
                              ]),
                              boutique: firstNonEmptyRowValue(row, [
                                "Boutique",
                                "Shop",
                              ]),
                              weight: firstNonEmptyRowValue(row, [
                                "Poids",
                                "Weight",
                              ]),
                              gps_link: firstNonEmptyRowValue(row, [
                                "Lien GPS",
                                "GPS",
                                "gps_link",
                              ]),
                              commune: communeForApi,
                              remarque: finalRemark,
                            };
                            if (DEBUG_ORDERS) {
                              debugLog("[BULK] Envoi securise", {
                                rowId: s.rowId,
                              });
                            }
                            const resp = await apiFetch("/api/orders/send", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                rowId: s.rowId,
                                deliveryType: settings.deliveryType,
                                order: payload,
                                row,
                                validate: true,
                                askCollection: 0,
                              }),
                            });
                            const data = await resp.json().catch(() => ({}));
                            if (DEBUG_ORDERS) {
                              debugLog("[BULK] Response", resp.status, {
                                success: data?.success === true,
                                hasTracking: Boolean(data?.tracking),
                              });
                            }
                            if (
                              resp.ok &&
                              data?.success === true &&
                              typeof data?.tracking === "string" &&
                              data.tracking.trim()
                            ) {
                              await handleUpdateRowStatus(
                                s.rowId,
                                typeof data.status === "string"
                                  ? data.status
                                  : "ready_to_ship",
                                {
                                  previousStatus: s.status,
                                  row,
                                  tracking: data.tracking.trim(),
                                  deliveryType: settings.deliveryType,
                                  persist: false,
                                }
                              );
                            } else {
                              console.error(
                                "[BULK] API error",
                                { status: resp.status }
                              );
                              alert(
                                `Erreur API (${resp.status}) pour ${s.rawName || s.name
                                }: ${typeof data === "string"
                                  ? data
                                  : data?.message || ""
                                }${data?.partialSuccess && data?.tracking
                                  ? `\nTracking cree: ${data.tracking}\nNe renvoyez pas avant verification.`
                                  : ""
                                }`
                              );
                            }
                          } catch (err) {
                            console.error("Erreur validation bulk:", err);
                            alert(
                              `Erreur réseau/timeout pour ${s.rawName || s.name
                              }`
                            );
                          }
                        }
                        clearSelection();
                      }}
                    >
                      Valider sélection
                    </button>
                    <button
                      type="button"
                      className="orders-button orders-button--danger"
                      disabled={selectedIds.size === 0}
                      onClick={async () => {
                        if (selectedIds.size === 0) return;
                        if (
                          !window.confirm(
                            `Supprimer ${selectedIds.size} commande(s) ?`
                          )
                        )
                          return;
                        for (const row of paginatedRows) {
                          const s = extractOrderSummary(row);
                          const id = s.rowId || s.displayRowLabel || "";
                          if (!id || !selectedIds.has(id)) continue;
                          try {
                            await handleUpdateRowStatus(s.rowId, "abandoned", {
                              previousStatus: s.status,
                              row,
                            });
                          } catch (err) {
                            console.error("Erreur suppression bulk:", err);
                          }
                        }
                        clearSelection();
                      }}
                    >
                      Supprimer sélection
                    </button>
                  </div>
                </div>
              )}
              <table className="orders-table">
                <thead>
                  <tr>
                    <th className="orders-table__header">Sélect.</th>
                    {headers.map((h) => (
                      <th key={h} className="orders-table__header">
                        {h}
                      </th>
                    ))}

                    <th className="orders-table__header">Total</th>

                    <th className="orders-table__header orders-table__header--comment">
                      Commentaire
                    </th>

                    <th className="orders-table__header">Livraison</th>
                    <th className="orders-table__header">Action</th>
                    <th className="orders-table__header">Statut</th>
                  </tr>
                </thead>
                <tbody className="orders-grid">
                  {paginatedRows.map((row, idx) => {
                    const summary = extractOrderSummary(row);
                    const fallbackKey = (() => {
                      const candidates = [
                        row["id-sheet"],
                        row["ID"],
                        row["Num commande"],
                        row["Numéro commande"],
                        row["Numero commande"],
                      ];
                      for (const candidate of candidates) {
                        if (candidate === undefined || candidate === null) {
                          continue;
                        }
                        const asString = String(candidate).trim();
                        if (asString) {
                          return asString;
                        }
                      }
                      return `row-${idx}`;
                    })();
                    const commentKey = resolveCommentKey(summary, fallbackKey);
                    const commentValue = orderComments[commentKey] ?? "";
                    return (
                      <OrderRowItem
                        key={row["id-sheet"] || row["ID"] || commentKey || idx}
                        row={row}
                        idx={idx}
                        headers={headers}
                        summary={summary}
                        onUpdateStatus={handleUpdateRowStatus}
                        onVariantClick={handleVariantClick}
                        onDeliveryTypeChange={handleDeliveryTypeChange}
                        onWilayaCommuneChange={handleWilayaCommuneChange}
                        commentKey={commentKey}
                        commentValue={commentValue}
                        onCommentChange={updateOrderComment}
                        onCommentEdit={handleCommentEditRequest}
                        // Checkbox de sélection
                        renderSelectionCell={() => {
                          const id =
                            summary.rowId || summary.displayRowLabel || "";
                          const checked = !!id && isSelected(id);
                          return (
                            <td className="orders-table__cell orders-table__cell--select">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  if (id) toggleSelected(id);
                                }}
                                onClick={(event) => event.stopPropagation()}
                                aria-label="Sélectionner la commande"
                              />
                            </td>
                          );
                        }}
                      />
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr className="orders-row orders-row--empty">
                      <td
                        className="orders-table__cell"
                        colSpan={headers.length + 5}
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

      {commentEditor.isOpen && (
        <div
          className="orders-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="comment-modal-title"
        >
          <div
            className="orders-modal__backdrop"
            onClick={handleCommentModalClose}
            aria-hidden="true"
          />
          <div className="orders-modal__content" role="document">
            <button
              type="button"
              className="orders-modal__close"
              onClick={handleCommentModalClose}
              aria-label="Fermer"
            >
              ×
            </button>

            <h2 id="comment-modal-title" className="orders-modal__title">
              {commentEditor.summary?.rawName ||
                commentEditor.summary?.name ||
                "Commentaire"}
            </h2>
            {commentEditor.summary?.displayRowLabel && (
              <p className="orders-modal__reference">
                Référence : {commentEditor.summary.displayRowLabel}
              </p>
            )}

            <div className="orders-modal__comment">
              <label
                htmlFor="comment-modal-field"
                className="orders-modal__comment-label"
              >
                Commentaire (optionnel)
              </label>
              <textarea
                id="comment-modal-field"
                className="orders-modal__comment-input"
                placeholder="Ajouter une remarque pour la livraison"
                defaultValue={commentEditor.value}
                onChange={handleCommentModalChange}
                maxLength={255}
                rows={4}
              />
              <p className="orders-modal__comment-hint">
                Ce commentaire sera enregistré pour cette commande.
              </p>
            </div>

            <div className="orders-modal__actions">
              <button
                type="button"
                onClick={handleCommentModalSave}
                className="orders-button orders-button--primary orders-modal__action-button"
              >
                Enregistrer le commentaire
              </button>
              <button
                type="button"
                onClick={handleCommentModalClose}
                className="orders-button orders-button--ghost orders-modal__action-button"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedOrder && selectedSummary && (
        <div
          className="orders-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="orders-modal-title"
        >
          <div
            className="orders-modal__backdrop"
            onClick={() => preserveScroll(() => setSelectedOrder(null))}
            aria-hidden="true"
          />
          <div className="orders-modal__content" role="document">
            <button
              type="button"
              className="orders-modal__close"
              onClick={() => preserveScroll(() => setSelectedOrder(null))}
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
                {getDisplayedOrderStatus(selectedOrder) || "Sans statut"}
              </span>
            </div>

            <OrderActionButtons
              row={selectedOrder}
              summary={selectedSummary}
              onUpdateStatus={handleUpdateRowStatus}
              variant="modal"
              commentKey={selectedOrderCommentKey}
              commentValue={selectedOrderCommentValue}
              onCommentChange={updateOrderComment}
            />

            <div className="orders-modal__details">
              {headers.map((header, index) => {
                const key = `${header || "col"}-${index}`;
                const trimmedHeader = header ? header.trim() : "";
                const normalizedHeader = trimmedHeader
                  ? normalizeFieldKey(trimmedHeader)
                  : "";
                const normalizedHeaderKeyForMatch = normalizeHeaderKey(
                  trimmedHeader || header || ""
                );
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
                const isCommuneColumnModal = normalizedHeaderKeyForMatch === "commune";

                if (
                  DELIVERY_MODE_HEADER_KEY_SET.has(normalizedHeaderKeyForMatch)
                ) {
                  const currentMode = normalizeSheetDeliveryMode(displayValue);
                  const deliveryModeSelect = buildDeliveryModeSelectState(
                    displayValue,
                    currentMode
                  );
                  return (
                    <div key={key} className="orders-modal__detail">
                      <span className="orders-modal__detail-label">
                        {header || "Type de livraison"}
                      </span>
                      <select
                       value={deliveryModeSelect.value}
                        onChange={(event) =>
                          preserveScroll(async () => {
                            const nextMode = normalizeDeliveryModeSelectValue(
                              event.target.value
                            );
                            debugLog("modal delivery select change", {
                              rowId:
                                selectedOrder?.["id-sheet"] ||
                                selectedOrder?.["ID"],
                              nextMode,
                              scroll: getScrollSnapshot(),
                            });
                            await handleDeliveryTypeChange(
                              selectedOrder,
                              nextMode
                            );
                          })
                        }
                        onClick={(event) => event.stopPropagation()}
                        className="orders-modal__detail-select"
                      >
                        {deliveryModeSelect.options.map((option) => (
                          <option
                            key={`${option.value}-${option.label}`}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                return (
                  <div key={key} className="orders-modal__detail">
                    <span className="orders-modal__detail-label">
                      {header || "Sans titre"}
                    </span>
                    <span className="orders-modal__detail-value">
                      {displayValue ? (
                        isCommuneColumnModal
                          ? getFrenchForDisplay(displayValue, selectedOrder["Wilaya"] || selectedOrder["wilaya"])
                          : (normalizedHeaderKeyForMatch === "wilaya" ? getFrenchWilaya(displayValue) : displayValue)
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
            onClick={() =>
              preserveScroll(() =>
                setVariantModalOpen({
                  isOpen: false,
                  orderRow: null,
                  productName: "",
                  currentVariant: "",
                })
              )
            }
            aria-hidden="true"
          />
          <div className="orders-modal__content" role="document">
            <button
              type="button"
              className="orders-modal__close"
              onClick={() =>
                preserveScroll(() =>
                  setVariantModalOpen({
                    isOpen: false,
                    orderRow: null,
                    productName: "",
                    currentVariant: "",
                  })
                )
              }
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
                      className={`orders-modal__variant-item ${variant.name === variantModalOpen.currentVariant
                        ? "is-current"
                        : ""
                        }`}
                      onClick={() => handleVariantSelect(variant.name)}
                      disabled={
                        variant.name === variantModalOpen.currentVariant
                      }
                    >
                      <div className="orders-modal__variant-info">
                        <span className="orders-modal__variant-name">
                          {variant.name}
                        </span>
                        <span
                          className={`orders-modal__variant-stock ${variant.quantity === 0 ? "is-zero" : ""
                            }`}
                        >
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

      {communeSelector.isOpen && (
        <CommuneSelectionModal
          isOpen={communeSelector.isOpen}
          wilayaCode={communeSelector.wilayaCode}
          wilayaName={communeSelector.wilayaName || String(communeSelector.wilayaCode)}
          communes={getCommunesByWilaya(communeSelector.wilayaCode)}
          onSelect={(commune) => {
            communeSelector.onSelect(commune);
            setCommuneSelector(prev => ({ ...prev, isOpen: false }));
          }}
          onClose={() => setCommuneSelector(prev => ({ ...prev, isOpen: false }))}
        />
      )}
    </div>
  );
};

export default Orders;
