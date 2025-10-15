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
import "../styles/AdminDashboard.css";

type TimeFilter = "all" | "day" | "month" | "year";

const TIME_FILTER_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "day", label: "Jour" },
  { value: "month", label: "Mois" },
  { value: "year", label: "Année" },
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

const filterRowsByTime = (rows: Record<string, string>[], filter: TimeFilter) => {
  if (filter === "all") return rows;
  const now = new Date();
  const start = new Date(now);

  if (filter === "day") {
    start.setHours(0, 0, 0, 0);
  } else if (filter === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  } else if (filter === "year") {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
  }

  return rows.filter(row => {
    const rowDate = extractRowDate(row);
    if (!rowDate) return false;
    return rowDate >= start && rowDate <= now;
  });
};

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
  const { user } = useContext(AuthContext);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const chartRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<ChartInstance | null>(null);
  const adminUser = user && user.role === "admin" ? user : null;

  useEffect(() => {
    if (!adminUser) {
      return;
    }
    if (id && adminUser.id !== id) {
      navigate(`/admin/${adminUser.id}`, { replace: true });
    }
  }, [adminUser, id, navigate]);

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

    const WILAYAS = [
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
    ];

    const DELIVERY_TARIFFS: Record<number, { domicile: number; stop: number }> = {
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

    const getWilayaIdByName = (name: string) => {
      const normalize = (s: string) =>
        (s || "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ");
      const target = normalize(name);
      const found = WILAYAS.find(w => normalize(w.name) === target);
      return found ? found.id : 16;
    };

    const getDeliveryTariff = (
      wilayaCode: number | string,
      stopDeskFlag: string | number
    ) => {
      const code = typeof wilayaCode === "string" ? parseInt(wilayaCode, 10) : wilayaCode;
      const isStop = String(stopDeskFlag) === "1";
      const safe = !code || Number.isNaN(code) ? 16 : code;
      let tariffs = DELIVERY_TARIFFS[safe];
      if (!tariffs) tariffs = DELIVERY_TARIFFS[16];
      if (!tariffs) return 0;
      return isStop ? tariffs.stop : tariffs.domicile;
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
            o["__MONTANT_TOTAL_CALC__"] = String(grand);
            return o;
          });
        setRows(mapped);
      } catch (error) {
        // silencieux
      }
    })();
  }, []);

  const statusSummary = useMemo(() => {
    return rows.reduce(
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
      } as Record<"new" | "confirmed" | "shipped" | "completed" | "returned" | "abandoned", number>
    );
  }, [rows]);

  const timeFilteredRows = useMemo(
    () => filterRowsByTime(rows, timeFilter),
    [rows, timeFilter]
  );

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

  const totalRevenue = useMemo(() => {
    return rows.reduce((acc, row) => {
      const amount = Number.parseFloat(row["__MONTANT_TOTAL_CALC__"] ?? "0");
      if (Number.isNaN(amount)) return acc;
      return acc + amount;
    }, 0);
  }, [rows]);

  const salesTrend = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 44);

    const dailyMap = new Map<string, { orders: number; revenue: number }>();

    rows.forEach(row => {
      const date = extractRowDate(row);
      if (!date) return;
      if (date < start || date > now) return;
      const dayKey = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      )
        .toISOString()
        .slice(0, 10);
      const current = dailyMap.get(dayKey) ?? { orders: 0, revenue: 0 };
      const amount = Number.parseFloat(row["__MONTANT_TOTAL_CALC__"] ?? "0");
      dailyMap.set(dayKey, {
        orders: current.orders + 1,
        revenue: current.revenue + (Number.isNaN(amount) ? 0 : amount),
      });
    });

    const trend: { label: string; orders: number; revenue: number }[] = [];
    for (let i = 44; i >= 0; i -= 1) {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(now.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      const entry = dailyMap.get(key) ?? { orders: 0, revenue: 0 };
      trend.push({
        label: date.toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
        }),
        orders: entry.orders,
        revenue: entry.revenue,
      });
    }

    return trend;
  }, [rows]);

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

    const revenueValues = salesTrend.map(point => Math.round(point.revenue));
    const maxRevenue = revenueValues.length
      ? Math.max(...revenueValues)
      : 0;

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

    const { step: yStepSize, max: yMax } = computeNiceStep(maxRevenue);

    chartInstanceRef.current = new Chart(ctx, {
      type: "line",
      data: {
        labels: salesTrend.map(point => point.label),
        datasets: [
          {
            label: "Ventes",
            data: revenueValues,
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
              label: tooltipItem => `ventes : ${tooltipItem.formattedValue}`,
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

  const getFirstValue = (row: Record<string, string>, keys: string[]): string => {
    for (const key of keys) {
      if (key in row && row[key] && row[key].trim()) {
        return row[key].trim();
      }
    }
    return "";
  };

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
      const amount = Number.parseFloat(row["__MONTANT_TOTAL_CALC__"] ?? "0");
      const current = products.get(productName) ?? { count: 0, revenue: 0 };
      products.set(productName, {
        count: current.count + 1,
        revenue: current.revenue + (Number.isNaN(amount) ? 0 : amount),
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
      <header className="dashboard-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="subtitle">
            Vue d'ensemble des {rows.length} commandes suivies pour {" "}
            {adminUser.firstName} {adminUser.lastName}
          </p>
        </div>
        <div className="user-pill">
          <span className="user-name">
            {adminUser.firstName} {adminUser.lastName}
          </span>
          <span className="user-role">Administrateur</span>
        </div>
      </header>

      <section className="stats-grid">
        {[
          { label: "New Orders", value: statusSummary.new },
          { label: "Confirmed", value: statusSummary.confirmed },
          { label: "Shipped", value: statusSummary.shipped },
          { label: "Completed", value: statusSummary.completed },
          { label: "Returned", value: statusSummary.returned },
          { label: "Abandoned", value: statusSummary.abandoned },
        ].map(card => (
          <div className="card" key={card.label}>
            <h3>{card.label}</h3>
            <div className="value">{card.value.toLocaleString("fr-DZ")}</div>
          </div>
        ))}
        <div className="card" key="total-sales">
          <h3>Total ventes</h3>
          <div className="value">{formatCurrency(totalRevenue)}</div>
        </div>
      </section>

      <div className="bottom-grid">
        <div className="chart-card">
          <h3>Évolution des ventes</h3>
          <p className="chart-sub">Montant cumulé sur les 45 derniers jours</p>
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
            {timeFilteredRows.length.toLocaleString("fr-DZ")} commande(s) sur la
            période
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
    </div>
  );
};

export default Admin;