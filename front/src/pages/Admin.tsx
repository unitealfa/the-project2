// front/src/pages/Admin.tsx

import React, {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useNavigate } from "react-router-dom";
import Chart from "chart.js/auto";
import type { Chart as ChartInstance } from "chart.js";
import { MapPin, Package } from "lucide-react";

import { AuthContext } from "../context/AuthContext";
import type { ProductDto } from "../types";
import "../styles/AdminDashboard.css";
import { apiFetch } from "../utils/api";

const PRODUCT_NAME_KEYS = [
  "Produit",
  "Product",
  "Article",
  "Nom du produit",
  "Produit commandé",
  "Item",
];

const PRODUCT_VARIANT_KEYS = [
  "Variante",
  "Variation",
  "Taille",
  "Variante produit",
  "Variant",
];

const PRODUCT_CODE_KEYS = [
  "Code",
  "code",
  "SKU",
  "Sku",
  "Référence",
  "Reference",
];

const QUANTITY_KEYS = ["Quantité", "Quantite", "Qte"];

const UNIT_PRICE_KEYS = ["Prix unitaire", "Prix", "PrixU", "PU", "Prix U"];

const TOTAL_PRICE_KEYS = [
  "Total",
  "total",
  "Montant",
  "Montant total",
  "Prix total",
];

const COST_PRICE_KEYS = [
  "Prix d'achat",
  "Prix achat",
  "Prix achat unitaire",
  "PA",
  "Prix d’achat",
];

const normalizeLookupValue = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const normalizeCodeValue = (value: string): string => value.trim().toLowerCase();

const parseAmountValue = (value?: string): number | null => {
  if (!value) return null;
  const cleaned = value
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(/,/g, ".");
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractQuantityValue = (row: Record<string, string>): number => {
  for (const key of QUANTITY_KEYS) {
    if (key in row) {
      const raw = row[key];
      if (!raw) continue;
      const sanitized = raw.replace(/[^\d]/g, "");
      if (!sanitized) continue;
      const parsed = Number.parseInt(sanitized, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return 1;
};

const extractUnitPriceValue = (row: Record<string, string>): number | null => {
  for (const key of UNIT_PRICE_KEYS) {
    const parsed = parseAmountValue(row[key]);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
};

const extractTotalPriceValue = (row: Record<string, string>): number | null => {
  for (const key of TOTAL_PRICE_KEYS) {
    const parsed = parseAmountValue(row[key]);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
};

const extractCostPriceValue = (row: Record<string, string>): number | null => {
  for (const key of COST_PRICE_KEYS) {
    const parsed = parseAmountValue(row[key]);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
};

const computeRowSaleAmount = (row: Record<string, string>, quantity: number): number => {
  const unit = extractUnitPriceValue(row);
  if (unit !== null) {
    return unit * quantity;
  }
  const total = extractTotalPriceValue(row);
  if (total !== null) {
    return total;
  }
  const fallback = Number.parseFloat(row["__MONTANT_TOTAL_CALC__"] ?? "0");
  return Number.isNaN(fallback) ? 0 : fallback;
};

const DEFAULT_WILAYA_ID = 16;

const WILAYAS: { id: number; name: string }[] = [
  { id: 1, name: "Adrar" },
  { id: 2, name: "Chlef" },
  { id: 3, name: "Laghouat" },
  { id: 4, name: "Oum El Bouaghi" },
  { id: 5, name: "Batna" },
  { id: 6, name: "Béjaïa" },
  { id: 7, name: "Biskra" },
  { id: 8, name: "Béchar" },
  { id: 9, name: "Blida" },
  { id: 10, name: "Bouira" },
  { id: 11, name: "Tamanrasset" },
  { id: 12, name: "Tébessa" },
  { id: 13, name: "Tlemcen" },
  { id: 14, name: "Tiaret" },
  { id: 15, name: "Tizi Ouzou" },
  { id: 16, name: "Alger" },
  { id: 17, name: "Djelfa" },
  { id: 18, name: "Jijel" },
  { id: 19, name: "Sétif" },
  { id: 20, name: "Saïda" },
  { id: 21, name: "Skikda" },
  { id: 22, name: "Sidi Bel Abbès" },
  { id: 23, name: "Annaba" },
  { id: 24, name: "Guelma" },
  { id: 25, name: "Constantine" },
  { id: 26, name: "Médéa" },
  { id: 27, name: "Mostaganem" },
  { id: 28, name: "M'Sila" },
  { id: 29, name: "Mascara" },
  { id: 30, name: "Ouargla" },
  { id: 31, name: "Oran" },
  { id: 32, name: "El Bayadh" },
  { id: 33, name: "Illizi" },
  { id: 34, name: "Bordj Bou Arreridj" },
  { id: 35, name: "Boumerdès" },
  { id: 36, name: "El Tarf" },
  { id: 37, name: "Tindouf" },
  { id: 38, name: "Tissemsilt" },
  { id: 39, name: "El Oued" },
  { id: 40, name: "Khenchela" },
  { id: 41, name: "Souk Ahras" },
  { id: 42, name: "Tipaza" },
  { id: 43, name: "Mila" },
  { id: 44, name: "Aïn Defla" },
  { id: 45, name: "Naâma" },
  { id: 46, name: "Aïn Témouchent" },
  { id: 47, name: "Ghardaïa" },
  { id: 48, name: "Relizane" },
  { id: 49, name: "Timimoun" },
  { id: 51, name: "Ouled Djellal" },
  { id: 52, name: "Beni Abbes" },
  { id: 53, name: "In Salah" },
  { id: 55, name: "Touggourt" },
  { id: 57, name: "El M'Ghair" },
  { id: 58, name: "El Meniaa" },
];

type DeliveryTariffs = { domicile: number; stop: number };

const DELIVERY_TARIFFS: Record<number, DeliveryTariffs> = {
  1: { domicile: 1100, stop: 600 },
  2: { domicile: 700, stop: 400 },
  3: { domicile: 900, stop: 500 },
  4: { domicile: 800, stop: 400 },
  5: { domicile: 800, stop: 400 },
  6: { domicile: 700, stop: 400 },
  7: { domicile: 900, stop: 500 },
  8: { domicile: 1100, stop: 600 },
  9: { domicile: 500, stop: 250 },
  10: { domicile: 650, stop: 400 },
  11: { domicile: 1300, stop: 800 },
  12: { domicile: 800, stop: 500 },
  13: { domicile: 800, stop: 400 },
  14: { domicile: 800, stop: 400 },
  15: { domicile: 650, stop: 400 },
  16: { domicile: 400, stop: 200 },
  17: { domicile: 900, stop: 500 },
  18: { domicile: 700, stop: 400 },
  19: { domicile: 700, stop: 400 },
  20: { domicile: 800, stop: 400 },
  21: { domicile: 700, stop: 400 },
  22: { domicile: 700, stop: 400 },
  23: { domicile: 700, stop: 400 },
  24: { domicile: 800, stop: 400 },
  25: { domicile: 700, stop: 400 },
  26: { domicile: 600, stop: 400 },
  27: { domicile: 700, stop: 400 },
  28: { domicile: 800, stop: 500 },
  29: { domicile: 700, stop: 400 },
  30: { domicile: 1000, stop: 500 },
  31: { domicile: 700, stop: 400 },
  32: { domicile: 1000, stop: 500 },
  33: { domicile: 1300, stop: 600 },
  34: { domicile: 700, stop: 400 },
  35: { domicile: 600, stop: 350 },
  36: { domicile: 800, stop: 400 },
  37: { domicile: 1300, stop: 600 },
  38: { domicile: 800, stop: 400 },
  39: { domicile: 900, stop: 500 },
  40: { domicile: 800, stop: 500 },
  41: { domicile: 800, stop: 500 },
  42: { domicile: 600, stop: 350 },
  43: { domicile: 700, stop: 400 },
  44: { domicile: 600, stop: 400 },
  45: { domicile: 1000, stop: 500 },
  46: { domicile: 700, stop: 400 },
  47: { domicile: 1000, stop: 500 },
  48: { domicile: 700, stop: 400 },
  49: { domicile: 1300, stop: 600 },
  51: { domicile: 900, stop: 500 },
  52: { domicile: 1300, stop: 0 },
  53: { domicile: 1300, stop: 600 },
  55: { domicile: 900, stop: 500 },
  57: { domicile: 900, stop: 0 },
  58: { domicile: 1000, stop: 500 },
};

const getWilayaIdByName = (name: string | undefined): number => {
  const target = name ? normalizeLookupValue(name) : "";
  if (!target) {
    return DEFAULT_WILAYA_ID;
  }
  const found = WILAYAS.find(
    wilaya => normalizeLookupValue(wilaya.name) === target
  );
  return found ? found.id : DEFAULT_WILAYA_ID;
};

const getDeliveryTariff = (
  wilayaCode: number | string | undefined,
  stopDeskFlag: string | number | undefined
): number => {
  const rawCode =
    typeof wilayaCode === "string"
      ? Number.parseInt(wilayaCode, 10)
      : wilayaCode ?? DEFAULT_WILAYA_ID;
  const safeCode =
    typeof rawCode === "number" && Number.isFinite(rawCode)
      ? rawCode
      : DEFAULT_WILAYA_ID;
  const tariffs = DELIVERY_TARIFFS[safeCode] ?? DELIVERY_TARIFFS[DEFAULT_WILAYA_ID];
  if (!tariffs) {
    return 0;
  }
  const flag = String(stopDeskFlag ?? "0").trim();
  const isStopDesk = flag === "1";
  return isStopDesk ? tariffs.stop : tariffs.domicile;
};

const resolveDeliveryFeeForRow = (row: Record<string, string>): number => {
  const storedFee = parseAmountValue(row["__FRAIS_LIVRAISON__"]);
  if (storedFee !== null) {
    return storedFee;
  }

  const wilayaCode = getWilayaIdByName(row["Wilaya"]);
  const rawType = String(
    row["Type de livraison"] ?? row["Mode de livraison"] ?? ""
  ).toLowerCase();
  const stopFlag = rawType.includes("stop") ? "1" : "0";

  return getDeliveryTariff(wilayaCode, stopFlag);
};

const computeNetSaleAmount = (
  row: Record<string, string>,
  quantity: number
): number => {
  const saleAmount = computeRowSaleAmount(row, quantity);
  const deliveryFee = resolveDeliveryFeeForRow(row);
  return saleAmount - deliveryFee;
};

type TimeFilter = "all" | "day" | "week" | "month" | "customMonth" | "year";
type ChartRangeMode = "recent" | "month" | "year";

const TIME_FILTER_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "day", label: "Aujourd'hui" },
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois" },
  { value: "customMonth", label: "Choisir un mois" },
  { value: "year", label: "Cette année" },
  { value: "all", label: "Tout" },
];

const parseSheetDateValue = (value: string | undefined): Date | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  const parsedTimestamp = Date.parse(raw);
  if (!Number.isNaN(parsedTimestamp)) {
    return new Date(parsedTimestamp);
  }

  const normalizedNumber = Number(raw.replace(",", "."));
  if (!Number.isNaN(normalizedNumber)) {
    if (normalizedNumber > 30000 && normalizedNumber < 60000) {
      const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
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
    const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = isoMatch;
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
    const [, dayStr, monthStr, yearStr, hourStr, minuteStr, secondStr] = frMatch;
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

const extractRowDate = (row: Record<string, string>): Date | null => {
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
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey) continue;
    if (!/date|jour|time|heure/.test(normalizedKey)) continue;
    const parsed = parseSheetDateValue(row[key]);
    if (parsed) return parsed;
  }

  return null;
};

const getRowStatus = (row: Record<string, string>): string => {
  const rawStatus = row["etat"] ?? row["État"] ?? row["Etat"] ?? "";
  const status =
    typeof rawStatus === "string"
      ? rawStatus.trim()
      : String(rawStatus ?? "").trim();
  return status || "new";
};

const normalizeCityLabel = (label: string): string => {
  const cleaned = label.trim();
  if (!cleaned) return "Inconnue";
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const resolveCityFromRow = (row: Record<string, string>): string => {
  const candidates = [
    row["Commune"],
    row["Ville"],
    row["City"],
    row["Adresse"],
    row["address"],
    row["Wilaya"],
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim()) {
      return normalizeCityLabel(candidate);
    }
  }

  return "Inconnue";
};

const filterRowsByTime = (
  rows: Record<string, string>[],
  filter: TimeFilter,
  customMonthValue?: string
) => {
  if (filter === "all") return rows;

  const now = new Date();
  let start: Date | null = null;
  let end: Date | null = null;

  if (filter === "day") {
    start = new Date(now);
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "week") {
    start = new Date(now);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "customMonth") {
    if (!customMonthValue) return [];
    const [yearStr, monthStr] = customMonthValue.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0) {
      return [];
    }
    start = new Date(year, monthIndex, 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(year, monthIndex + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else if (filter === "year") {
    start = new Date(now.getFullYear(), 0, 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  }

  if (!start || !end) return rows;

  return rows.filter(row => {
    const rowDate = extractRowDate(row);
    if (!rowDate) return false;
    return rowDate >= start && rowDate <= end;
  });
};

const getMonthValue = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const formatMonthLabel = (value: string): string => {
  const [yearStr, monthStr] = value.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  if (Number.isNaN(year) || Number.isNaN(monthIndex) || monthIndex < 0) {
    return value;
  }

  const formatter = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
  });

  return formatter.format(new Date(year, monthIndex, 1));
};

const getDefaultMonthValue = () => getMonthValue(new Date());
const getDefaultYearValue = () => new Date().getFullYear().toString();

const mapStatusBucket = (status: string):
  | "new"
  | "confirmed"
  | "shipped"
  | "completed"
  | "returned"
  | "abandoned"
  | null => {
  const normalized = status.trim().toLowerCase();
  if (!normalized || /new|nouveau|pending|en cours/.test(normalized)) {
    return "new";
  }
  if (/confirm/.test(normalized)) {
    return "confirmed";
  }
  if (/ship|expédi|exped/.test(normalized)) {
    return "shipped";
  }
  if (/livr|deliver|complete|termin/.test(normalized)) {
    return "completed";
  }
  if (/retour|return/.test(normalized)) {
    return "returned";
  }
  if (/abandon|annul/.test(normalized)) {
    return "abandoned";
  }
  return null;
};

const Admin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useContext(AuthContext);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [products, setProducts] = useState<ProductDto[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("day");
  const [timeFilterMonth, setTimeFilterMonth] = useState<string>(
    () => getDefaultMonthValue()
  );
  const [chartRangeMode, setChartRangeMode] =
    useState<ChartRangeMode>("recent");
  const [selectedMonth, setSelectedMonth] =
    useState<string>(getDefaultMonthValue);
  const [selectedYear, setSelectedYear] = useState<string>(getDefaultYearValue);
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartInstance | null>(null);
  const adminUser = user && user.role === "admin" ? user : null;
  const [isProfitModalOpen, setProfitModalOpen] = useState(false);
  const isLoading = rowsLoading || productsLoading;

  useEffect(() => {
    if (!adminUser) {
      return;
    }
    if (id && adminUser.id !== id) {
      navigate(`/admin/${adminUser.id}`, { replace: true });
    }
  }, [adminUser, id, navigate]);

  useEffect(() => {
    if (!adminUser || !token) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }

    let cancelled = false;
    setProductsLoading(true);

    (async () => {
      try {
        const response = await apiFetch("/api/products", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error(`Erreur ${response.status}`);
        }

        const data = await response.json();
        if (cancelled) return;

        const mapped: ProductDto[] = Array.isArray(data)
          ? data.map((item: any) => ({
            id: item._id || item.id,
            code: typeof item.code === "string" ? item.code : undefined,
            name: typeof item.name === "string" ? item.name : "",
            costPrice: Number(item.costPrice ?? 0) || 0,
            salePrice: Number(item.salePrice ?? 0) || 0,
            variants: Array.isArray(item.variants)
              ? item.variants.map((variant: any) => ({
                name: String(variant?.name ?? ""),
                quantity: Number(variant?.quantity ?? 0) || 0,
              }))
              : [],
          }))
          : [];

        setProducts(mapped);
      } catch (error) {
        if (!cancelled) {
          setProducts([]);
        }
      } finally {
        if (!cancelled) {
          setProductsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [adminUser, token]);


  useEffect(() => {
    const SHEET_ID = "1Z5etRgUtjHz2QiZm0SDW9vVHPcFxHPEvw08UY9i7P9Q";
    const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`;

    const parseCsv = (csvText: string): string[][] => {
      const out: string[][] = [];
      let field = "";
      let row: string[] = [];
      let inQuotes = false;
      for (let i = 0; i < csvText.length; i += 1) {
        const c = csvText[i];
        const n = csvText[i + 1];
        if (inQuotes) {
          if (c === "\"") {
            if (n === "\"") {
              field += "\"";
              i += 1;
            } else {
              inQuotes = false;
            }
          } else {
            field += c;
          }
        } else if (c === "\"") {
          inQuotes = true;
        } else if (c === ",") {
          row.push(field);
          field = "";
        } else if (c === "\n") {
          row.push(field);
          out.push(row);
          row = [];
          field = "";
        } else if (c === "\r") {
          // ignore
        } else {
          field += c;
        }
      }
      if (field.length > 0 || inQuotes || row.length > 0) {
        row.push(field);
        out.push(row);
      }
      return out;
    };

    const normalizeAmount = (amount: string): number => {
      if (!amount) return 1000;
      const normalized = amount.replace(/[^\d.,]/g, "").replace(",", ".");
      const n = parseFloat(normalized);
      if (Number.isNaN(n)) return 1000;
      return n;
    };

    (async () => {
      try {
        const res = await fetch(CSV_URL);
        const text = await res.text();
        const grid = parseCsv(text);
        if (grid.length === 0) return;
        const [hdr, ...data] = grid;
        const mapped = data
          .filter(r => r.some(cell => cell && cell.trim() !== ""))
          .map(r => {
            const o: Record<string, string> = {};
            hdr.forEach((h, i) => {
              o[h] = r[i] ?? "";
            });
            const qty =
              parseInt(
                (o["Quantité"] || o["Quantite"] || o["Qte"] || "1")
                  .toString()
                  .replace(/[^\d]/g, ""),
                10
              ) || 1;
            const unit = normalizeAmount(o["Total"] || "1000");
            const code = getWilayaIdByName(o["Wilaya"]);
            const stopFlag = (o["Type de livraison"] || "")
              .toLowerCase()
              .includes("stop")
              ? "1"
              : "0";
            const tariff = getDeliveryTariff(code, stopFlag);
            const grand = unit * qty + tariff;
            o["__FRAIS_LIVRAISON__"] = String(tariff);
            o["__MONTANT_TOTAL_CALC__"] = String(grand);
            return o;
          });
        setRows(mapped);
      } catch (error) {
        // silencieux
      } finally {
        setRowsLoading(false);
      }
    })();
  }, []);

  const timeFilteredRows = useMemo(
    () => filterRowsByTime(rows, timeFilter, timeFilterMonth),
    [rows, timeFilter, timeFilterMonth]
  );

  const filteredStatusSummary = useMemo(() => {
    return timeFilteredRows.reduce(
      (acc, row) => {
        const bucket = mapStatusBucket(getRowStatus(row));
        if (!bucket) return acc;
        acc[bucket] += 1;
        return acc;
      },
      {
        new: 0,
        confirmed: 0,
        shipped: 0,
        completed: 0,
        returned: 0,
        abandoned: 0,
      } as Record<
        "new" | "confirmed" | "shipped" | "completed" | "returned" | "abandoned",
        number
      >
    );
  }, [timeFilteredRows]);

  const topCities = useMemo(() => {
    const counts = new Map<string, number>();
    timeFilteredRows.forEach(row => {
      const city = resolveCityFromRow(row);
      counts.set(city, (counts.get(city) ?? 0) + 1);
    });

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [timeFilteredRows]);

  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    rows.forEach(row => {
      const date = extractRowDate(row);
      if (!date) return;
      monthSet.add(getMonthValue(date));
    });

    if (monthSet.size === 0) {
      monthSet.add(getDefaultMonthValue());
    }

    return Array.from(monthSet)
      .sort()
      .map(value => ({ value, label: formatMonthLabel(value) }));
  }, [rows]);

  useEffect(() => {
    if (!availableMonths.some(month => month.value === timeFilterMonth)) {
      const fallback =
        availableMonths[availableMonths.length - 1]?.value ?? getDefaultMonthValue();
      setTimeFilterMonth(fallback);
    }
  }, [availableMonths, timeFilterMonth]);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    rows.forEach(row => {
      const date = extractRowDate(row);
      if (!date) return;
      yearSet.add(date.getFullYear());
    });

    if (yearSet.size === 0) {
      yearSet.add(Number.parseInt(getDefaultYearValue(), 10));
    }

    return Array.from(yearSet).sort((a, b) => a - b);
  }, [rows]);

  useEffect(() => {
    if (!availableMonths.some(month => month.value === selectedMonth)) {
      const fallback =
        availableMonths[availableMonths.length - 1]?.value ?? getDefaultMonthValue();
      setSelectedMonth(fallback);
    }
  }, [availableMonths, selectedMonth]);

  useEffect(() => {
    if (!availableYears.some(year => year.toString() === selectedYear)) {
      const fallback =
        availableYears[availableYears.length - 1]?.toString() ?? getDefaultYearValue();
      setSelectedYear(fallback);
    }
  }, [availableYears, selectedYear]);

  const chartSubtitle = useMemo(() => {
    if (chartRangeMode === "month") {
      return `Nombre quotidien pour ${formatMonthLabel(selectedMonth)}`;
    }

    if (chartRangeMode === "year") {
      return selectedYear
        ? `Nombre quotidien durant ${selectedYear}`
        : "Nombre quotidien sur l'année sélectionnée";
    }

    return "Nombre quotidien sur les 45 derniers jours";
  }, [chartRangeMode, selectedMonth, selectedYear]);


  const timeFilterLabel = useMemo(() => {
    if (timeFilter === "customMonth") {
      const monthLabel =
        availableMonths.find(month => month.value === timeFilterMonth)?.label ??
        formatMonthLabel(timeFilterMonth);
      return `le mois de ${monthLabel}`;
    }

    switch (timeFilter) {
      case "day":
        return "aujourd'hui";
      case "week":
        return "cette semaine";
      case "month":
        return "ce mois-ci";
      case "year":
        return "cette année";
      default:
        return "toute la période";
    }
  }, [availableMonths, timeFilter, timeFilterMonth]);

  const getFirstValue = (row: Record<string, string>, keys: string[]): string => {
    for (const key of keys) {
      if (key in row && row[key] && row[key].trim()) {
        return row[key].trim();
      }
    }
    return "";
  };

  const salesAndProfit = useMemo(() => {
    const productIndex = new Map<
      string,
      { product: ProductDto; label: string }
    >();

    products.forEach(product => {
      if (!product) return;
      const baseLabel = product.name || product.code || "Produit";
      const normalizedName = product.name
        ? normalizeLookupValue(product.name)
        : "";
      const normalizedCode = product.code
        ? normalizeCodeValue(product.code)
        : "";

      if (normalizedCode) {
        productIndex.set(`code:${normalizedCode}`, { product, label: baseLabel });
      }

      if (normalizedName) {
        productIndex.set(`name:${normalizedName}`, { product, label: baseLabel });
      }

      (product.variants ?? []).forEach(variant => {
        const variantName = variant?.name ? String(variant.name) : "";
        if (!variantName || !normalizedName) return;
        const normalizedVariant = normalizeLookupValue(variantName);
        productIndex.set(`variant:${normalizedName}::${normalizedVariant}`, {
          product,
          label: `${product.name}${variantName ? ` (${variantName})` : ""}`,
        });
      });
    });

    const perProduct = new Map<
      string,
      { label: string; sales: number; profit: number; quantity: number }
    >();

    let totalSales = 0;
    let totalProfit = 0;

    timeFilteredRows.forEach((row, index) => {
      const bucket = mapStatusBucket(getRowStatus(row));
      if (bucket !== "completed") {
        return;
      }

      const quantity = extractQuantityValue(row);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return;
      }

      const saleAmountFromRow = computeRowSaleAmount(row, quantity);
      const productCode = getFirstValue(row, PRODUCT_CODE_KEYS);
      const productName = getFirstValue(row, PRODUCT_NAME_KEYS);
      const variantName = getFirstValue(row, PRODUCT_VARIANT_KEYS);

      const lookupKeys: string[] = [];
      if (productCode) {
        lookupKeys.push(`code:${normalizeCodeValue(productCode)}`);
      }
      if (productName) {
        lookupKeys.push(`name:${normalizeLookupValue(productName)}`);
      }
      if (productName && variantName) {
        lookupKeys.push(
          `variant:${normalizeLookupValue(productName)}::${normalizeLookupValue(variantName)}`
        );
      }

      let matched: { product: ProductDto; label: string } | null = null;
      for (const key of lookupKeys) {
        const candidate = productIndex.get(key);
        if (candidate) {
          matched = candidate;
          break;
        }
      }

      const costFromRow = extractCostPriceValue(row);
      let unitCost: number | null = null;

      if (matched) {
        const costPrice = Number(matched.product.costPrice ?? 0);
        if (Number.isFinite(costPrice) && costPrice >= 0) {
          unitCost = costPrice;
        } else {
          unitCost = costFromRow;
        }
      } else {
        unitCost = costFromRow;
      }

      const deliveryFee = resolveDeliveryFeeForRow(row);
      const grossSaleAmount = Number.isFinite(saleAmountFromRow)
        ? saleAmountFromRow
        : 0;
      const netSaleAmount = grossSaleAmount - deliveryFee;

      let profit = netSaleAmount;
      if (unitCost !== null && Number.isFinite(unitCost)) {
        profit = netSaleAmount - unitCost * quantity;
      }

      totalSales += netSaleAmount;
      totalProfit += profit;

      const variantSuffix = variantName ? ` (${variantName})` : "";
      let label = matched?.label ??
        (productName
          ? `${productName}${variantSuffix}`
          : productCode || `Produit ${index + 1}`);

      if (matched && variantName) {
        label = `${matched.product.name}${variantSuffix}`;
      }

      const variantKeyPart = variantName
        ? `::${normalizeLookupValue(variantName)}`
        : "";

      const aggregateKey =
        (matched?.product.id &&
          `id:${matched.product.id}${variantKeyPart}`) ||
        (matched?.product.code &&
          `code:${normalizeCodeValue(String(matched.product.code))}${variantKeyPart}`) ||
        (matched &&
          `name:${normalizeLookupValue(matched.product.name)}${variantKeyPart}`) ||
        (productCode && `code:${normalizeCodeValue(productCode)}${variantKeyPart}`) ||
        (productName && `name:${normalizeLookupValue(productName)}${variantKeyPart}`) ||
        `row:${index}`;

      const existing =
        perProduct.get(aggregateKey) ?? {
          label,
          sales: 0,
          profit: 0,
          quantity: 0,
        };

      existing.label = label;
      existing.sales += netSaleAmount;
      existing.profit += profit;
      existing.quantity += quantity;
      perProduct.set(aggregateKey, existing);
    });

    return {
      totalSales,
      totalProfit,
      perProduct: Array.from(perProduct.values()).sort(
        (a, b) => b.profit - a.profit
      ),
    };
  }, [products, timeFilteredRows]);

  const salesTrend = useMemo(() => {
    const now = new Date();
    let start = new Date(now);
    let end = new Date(now);
    start.setDate(start.getDate() - 44);

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (chartRangeMode === "month") {
      const [yearStr, monthStr] = selectedMonth.split("-");
      const year = Number(yearStr);
      const monthIndex = Number(monthStr) - 1;

      if (!Number.isNaN(year) && !Number.isNaN(monthIndex) && monthIndex >= 0) {
        start = new Date(year, monthIndex, 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(year, monthIndex + 1, 0);
        end.setHours(23, 59, 59, 999);
      }
    } else if (chartRangeMode === "year") {
      const year = Number(selectedYear);
      if (!Number.isNaN(year)) {
        start = new Date(year, 0, 1);
        start.setHours(0, 0, 0, 0);
        end = new Date(year, 11, 31);
        end.setHours(23, 59, 59, 999);
      }
    }

    const dailyMap = new Map<string, { orders: number; revenue: number }>();

    rows.forEach(row => {
      const date = extractRowDate(row);
      if (!date) return;
      if (date < start || date > end) return;
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(date.getDate()).padStart(2, "0")}`;
      const current = dailyMap.get(dayKey) ?? { orders: 0, revenue: 0 };
      const quantity = extractQuantityValue(row);
      const netSale = computeNetSaleAmount(row, quantity);
      dailyMap.set(dayKey, {
        orders: current.orders + 1,
        revenue: current.revenue + (Number.isNaN(netSale) ? 0 : netSale),
      });
    });

    const trend: { label: string; orders: number; revenue: number }[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(cursor.getDate()).padStart(2, "0")}`;
      const entry = dailyMap.get(key) ?? { orders: 0, revenue: 0 };
      trend.push({
        label: cursor.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
        }),
        orders: entry.orders,
        revenue: entry.revenue,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return trend;
  }, [rows, chartRangeMode, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!chartRef.current) return;
    const ctx = chartRef.current.getContext("2d");
    if (!ctx) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(107, 114, 128, 0.35)");
    gradient.addColorStop(1, "rgba(107, 114, 128, 0)");

    const orderValues = salesTrend.map(point => point.orders);
    const maxOrders = orderValues.length ? Math.max(...orderValues) : 0;

    const computeNiceStep = (maxValue: number): { step: number; max: number } => {
      if (maxValue <= 0) {
        return { step: 1, max: 1 };
      }

      const desiredSteps = 4;
      const roughStep = maxValue / desiredSteps;
      const magnitude = 10 ** Math.floor(Math.log10(roughStep));
      const normalized = roughStep / magnitude;

      let niceNormalized: number;
      if (normalized <= 1) niceNormalized = 1;
      else if (normalized <= 2) niceNormalized = 2;
      else if (normalized <= 5) niceNormalized = 5;
      else niceNormalized = 10;

      const step = niceNormalized * magnitude;
      const max = Math.ceil(maxValue / step) * step;

      return { step, max };
    };

    const { step: yStepSize, max: yMax } = computeNiceStep(maxOrders);

    chartInstanceRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: salesTrend.map(point => point.label),
        datasets: [
          {
            label: "Commandes",
            data: orderValues,
            fill: true,
            borderColor: "#6b7280",
            borderWidth: 1.8,
            backgroundColor: gradient,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: "#111827",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "nearest", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#fff",
            titleColor: "#111",
            bodyColor: "#111",
            borderColor: "#e5e7eb",
            borderWidth: 1,
            displayColors: false,
            padding: 10,
            callbacks: {
              title: tooltipItems => tooltipItems[0]?.label ?? "",
              label: tooltipItem =>
                `commandes : ${new Intl.NumberFormat("fr-FR", {
                  maximumFractionDigits: 0,
                }).format(tooltipItem.parsed.y ?? 0)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: "#e5e7eb" },
            ticks: { color: "#6b7280" },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: "#6b7280",
              stepSize: yStepSize,
              callback: value =>
                new Intl.NumberFormat("fr-FR", {
                  maximumFractionDigits: 0,
                }).format(Number(value)),
            },
            suggestedMax: yMax,
            grid: { color: "#e5e7eb" },
          },
        },
      },
    });

    return () => {
      chartInstanceRef.current?.destroy();
    };
  }, [salesTrend]);

  const formatCurrency = (value: number): string =>
    `${new Intl.NumberFormat("fr-DZ", {
      maximumFractionDigits: 0,
    }).format(Math.round(value))} DA`;

  const recentOrders = useMemo(() => {
    return rows
      .map((row, index) => {
        const date = extractRowDate(row);
        const timestamp = date?.getTime() ?? 0;
        const status = getRowStatus(row);
        const orderId =
          getFirstValue(row, [
            "ID",
            "Id",
            "#",
            "Num commande",
            "Référence",
            "Reference",
            "Commande",
          ]) || `Commande ${index + 1}`;
        const customer =
          getFirstValue(row, [
            "Nom",
            "Client",
            "Full Name",
            "Name",
            "Nom et prénom",
            "Nom complet",
          ]) || "Client inconnu";
        const amount = Number.parseFloat(row["__MONTANT_TOTAL_CALC__"] ?? "0");
        return {
          key: `${orderId}-${index}`,
          orderId,
          customer,
          city: resolveCityFromRow(row),
          status,
          amount: Number.isNaN(amount) ? 0 : amount,
          timestamp,
          date,
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);
  }, [rows]);

  const popularProducts = useMemo(() => {
    const productKeys = [
      "Produit",
      "Product",
      "Article",
      "Nom du produit",
      "Produit commandé",
      "Item",
    ];

    const products = new Map<string, { count: number; revenue: number }>();

    rows.forEach(row => {
      const productName = getFirstValue(row, productKeys);
      if (!productName) return;
      const quantity = extractQuantityValue(row);
      const netSale = computeNetSaleAmount(row, quantity);
      const current = products.get(productName) ?? { count: 0, revenue: 0 };
      products.set(productName, {
        count: current.count + 1,
        revenue: current.revenue + (Number.isNaN(netSale) ? 0 : netSale),
      });
    });

    return Array.from(products.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        revenue: stats.revenue,
      }));
  }, [rows]);

  const { totalSales, totalProfit, perProduct } = salesAndProfit;

  const resolveStatusLabel = (status: string) => {
    const bucket = mapStatusBucket(status);
    switch (bucket) {
      case "new":
        return { label: "Nouveau", className: "status-new" };
      case "confirmed":
        return { label: "Confirmé", className: "status-confirmed" };
      case "shipped":
        return { label: "Expédié", className: "status-shipped" };
      case "completed":
        return { label: "Livré", className: "status-completed" };
      case "returned":
        return { label: "Retourné", className: "status-returned" };
      case "abandoned":
        return { label: "Abandonné", className: "status-abandoned" };
      default:
        return { label: status || "Statut inconnu", className: "status-default" };
    }
  };

  if (!adminUser) {
    return (
      <p style={{ textAlign: "center", marginTop: "2rem" }}>
        Accès non autorisé
      </p>
    );
  }

  if (id && adminUser.id !== id) {
    return (
      <p style={{ textAlign: "center", marginTop: "2rem" }}>Chargement…</p>
    );
  }

  const cityMaxCount = topCities.length
    ? Math.max(...topCities.map(([, count]) => count))
    : 0;

  return (
    <div className="admin-dashboard">
      {isLoading && (
        <div className="admin-loader" role="status" aria-live="polite">
          <div className="admin-loader__spinner" />
          <p>Chargement</p>
        </div>
      )}
      <header className="dashboard-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="subtitle">
            Vue d'ensemble de {timeFilteredRows.length.toLocaleString("fr-DZ")} {" "}
            commande(s) pour {timeFilterLabel}, suivies par {adminUser.firstName}{" "}
            {adminUser.lastName}
          </p>
        </div>
        <div className="user-pill">
          <span className="user-name">
            {adminUser.firstName} {adminUser.lastName}
          </span>
          <span className="user-role">Administrateur</span>
        </div>
      </header>

      <section className="stats-section">
        <div className="stats-toolbar">
          <label className="filter-control">
            <span>Période :</span>
            <select
              value={timeFilter}
              onChange={event => setTimeFilter(event.target.value as TimeFilter)}
            >
              {TIME_FILTER_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {timeFilter === "customMonth" && (
            <label className="filter-control">
              <span>Mois :</span>
              <select
                value={timeFilterMonth}
                onChange={event => setTimeFilterMonth(event.target.value)}
              >
                {availableMonths.map(month => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="stats-grid">
          {[
            { label: "New Orders", value: filteredStatusSummary.new },
            { label: "Confirmed", value: filteredStatusSummary.confirmed },
            { label: "Shipped", value: filteredStatusSummary.shipped },
            { label: "Completed", value: filteredStatusSummary.completed },
            { label: "Returned", value: filteredStatusSummary.returned },
            { label: "Abandoned", value: filteredStatusSummary.abandoned },
          ].map(card => (
            <div className="card" key={card.label}>
              <h3>{card.label}</h3>
              <div className="value">{card.value.toLocaleString("fr-DZ")}</div>
            </div>
          ))}
          <div className="card" key="total-sales">
            <h3>Total ventes</h3>
            <div className="value">{formatCurrency(totalSales)}</div>
            <button
              type="button"
              className="profit-summary-button"
              onClick={() => setProfitModalOpen(true)}
            >
              Bénéfice : <span>{formatCurrency(totalProfit)}</span>
            </button>
          </div>
        </div>
      </section>

      <div className="bottom-grid">
        <div className="chart-card">
          <div className="card-header">
            <div>
              <h3>Évolution des commandes</h3>
              <p className="chart-sub">{chartSubtitle}</p>
            </div>
            <div className="chart-filters">
              <select
                aria-label="Plage de temps du graphique"
                value={chartRangeMode}
                onChange={event =>
                  setChartRangeMode(event.target.value as ChartRangeMode)
                }
              >
                <option value="recent">45 derniers jours</option>
                <option value="month">Par mois</option>
                <option value="year">Par année</option>
              </select>
              {chartRangeMode === "month" && (
                <select
                  aria-label="Mois à afficher"
                  value={selectedMonth}
                  onChange={event => setSelectedMonth(event.target.value)}
                >
                  {availableMonths.map(month => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              )}
              {chartRangeMode === "year" && (
                <select
                  aria-label="Année à afficher"
                  value={selectedYear}
                  onChange={event => setSelectedYear(event.target.value)}
                >
                  {availableYears.map(year => (
                    <option key={year} value={year.toString()}>
                      {year}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="chart-wrapper">
            <canvas ref={chartRef} />
          </div>
        </div>

        <div className="cities-card">
          <div className="card-header">
            <div>
              <h3>Top villes</h3>
              <p className="cities-sub">Répartition géographique des commandes</p>
            </div>
            <label className="filter-control">
              <span>Filtrer :</span>
              <select
                value={timeFilter}
                onChange={event => setTimeFilter(event.target.value as TimeFilter)}
              >
                {TIME_FILTER_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="filter-hint">
            {timeFilteredRows.length.toLocaleString("fr-DZ")} commande(s) pour {" "}
            {timeFilterLabel}
          </p>

          {topCities.length > 0 ? (
            topCities.map(([city, count]) => (
              <div className="city" key={city}>
                <div className="label">
                  <span>
                    <MapPin size={14} />
                    {city}
                  </span>
                  <span>{count.toLocaleString("fr-DZ")}</span>
                </div>
                <div className="bar">
                  <span
                    style={{
                      width: cityMaxCount
                        ? `${Math.max((count / cityMaxCount) * 100, 6)}%`
                        : "6%",
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="empty-state">Aucune donnée disponible pour ce filtre.</p>
          )}
        </div>
      </div>

      <div className="data-grid">
        <div className="data-card">
          <h3>Commandes récentes</h3>
          <p className="data-sub">Les 5 dernières commandes importées</p>

          {recentOrders.length > 0 ? (
            recentOrders.map(order => {
              const { label, className } = resolveStatusLabel(order.status);
              return (
                <div className="order" key={order.key}>
                  <div className="left">
                    <strong>
                      {order.orderId}
                      <span className={`status-pill ${className}`}>{label}</span>
                    </strong>
                    <span>
                      {order.customer} • {order.city}
                    </span>
                  </div>
                  <div className="right">
                    <strong>{formatCurrency(order.amount)}</strong>
                    <span className="order-date">
                      {order.date
                        ? new Intl.DateTimeFormat("fr-FR", {
                          day: "2-digit",
                          month: "short",
                        }).format(order.date)
                        : "Date inconnue"}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="empty-state">Aucune commande récente disponible.</p>
          )}
        </div>

        <div className="data-card">
          <h3>Produits populaires</h3>
          <p className="data-sub">Les produits les plus demandés ce mois-ci</p>

          {popularProducts.length > 0 ? (
            popularProducts.map(product => (
              <div className="product" key={product.name}>
                <div className="left">
                  <div className="icon">
                    <Package size={18} />
                  </div>
                  <div>
                    <strong>{product.name}</strong>
                    <span>
                      {product.count.toLocaleString("fr-DZ")} vente(s)
                    </span>
                  </div>
                </div>
                <strong>{formatCurrency(product.revenue)}</strong>
              </div>
            ))
          ) : (
            <p className="empty-state">
              Impossible d'afficher des produits populaires pour le moment.
            </p>
          )}
        </div>
      </div>
      {isProfitModalOpen && (
        <div
          className="profit-modal__backdrop"
          role="presentation"
          onClick={() => setProfitModalOpen(false)}
        >
          <div
            className="profit-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Détails des bénéfices"
            onClick={event => event.stopPropagation()}
          >
            <div className="profit-modal__header">
              <h3>Détails des bénéfices</h3>
              <button
                type="button"
                className="profit-modal__close"
                onClick={() => setProfitModalOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="profit-modal__body">
              {perProduct.length > 0 ? (
                <table className="profit-modal__table">
                  <thead>
                    <tr>
                      <th>Produit</th>
                      <th>Quantité</th>
                      <th>Ventes</th>
                      <th>Bénéfice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perProduct.map((entry, index) => (
                      <tr key={`${entry.label}-${index}`}>
                        <td>{entry.label}</td>
                        <td>{entry.quantity.toLocaleString("fr-DZ")}</td>
                        <td>{formatCurrency(entry.sales)}</td>
                        <td className={entry.profit >= 0 ? undefined : "negative"}>
                          {formatCurrency(entry.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="profit-modal__empty">
                  Aucune commande livrée ne permet de calculer un bénéfice.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;
