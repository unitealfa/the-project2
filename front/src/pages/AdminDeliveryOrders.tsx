import React, { useContext, useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { AuthContext } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import "../styles/AdminDeliveryOrders.css";

type DeliveryType = "api_dhd" | "api_sook" | "livreur";

interface OrderRow {
  [key: string]: any;
  "Nom du client"?: string;
  Numero?: string;
  "Numéro"?: string;
  "Téléphone"?: string;
  Adresse?: string;
  Commune?: string;
  Wilaya?: string;
}

interface Order {
  _id: string;
  rowId: string;
  status: string;
  tracking?: string;
  deliveryType: DeliveryType;
  deliveryPersonId?: string;
  deliveryPersonName?: string;
  createdAt: string;
  updatedAt: string;
  row?: OrderRow;
}

const formatPhoneNumber = (value?: string | number | null): string => {
  if (value === undefined || value === null) return "N/A";
  const raw = String(value).trim();
  if (!raw) return "N/A";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("213") && digits.length >= 12) digits = digits.slice(3);
  if (digits.length === 9) digits = `0${digits}`;
  else if (!digits.startsWith("0") && digits.length > 9) digits = `0${digits.slice(-9)}`;
  else if (!digits.startsWith("0")) digits = `0${digits}`;
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(0, 10);
  return digits || "N/A";
};

const getInitials = (value?: string): string => {
  if (!value) return "";
  return value
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .filter(Boolean)
    .join("");
};

const normalizeStatus = (value: string) =>
  value?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") ?? "";

const shouldDisplayStatus = (status: string) => {
  const normalized = normalizeStatus(status);
  if (!normalized) return false;
  if (normalized.includes("assign")) return true;
  return false;
};

const AdminDeliveryOrders: React.FC = () => {
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user?.role === "admin") {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch("/api/orders/delivery-person/orders");
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Erreur lors du chargement des commandes");
      }
      const loadedOrders: Order[] = data.orders || [];
      const filtered = loadedOrders.filter((order) =>
        shouldDisplayStatus(order.status || "")
      );
      setOrders(filtered);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de connexion";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (rowId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(orders.map((o) => o.rowId || o._id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedIds.has(order.rowId || order._id)),
    [orders, selectedIds]
  );

  const renderCardToCanvas = async (order: Order) => {
    const cardId = `admin-delivery-card-${order.rowId || order._id}`;
    const card = document.getElementById(cardId);
    if (!card) {
      throw new Error(
        `Carte introuvable pour la commande ${order.rowId || order._id}`
      );
    }
    const cleanup = hideForPrint(card, [
      ".admin-delivery-actions",
      ".admin-delivery-checkbox",
      ".admin-delivery-status",
    ]);
    const canvas = await html2canvas(card, {
      scale: 2,
      useCORS: true,
      windowWidth: card.scrollWidth,
    });
    cleanup();
    return canvas;
  };

  const hideForPrint = (card: HTMLElement, selectors: string[]) => {
    const affected: Array<{ el: HTMLElement; prev: string }> = [];
    selectors.forEach((sel) => {
      card.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        affected.push({ el, prev: el.style.visibility });
        el.style.visibility = "hidden";
      });
    });
    return () => {
      affected.forEach(({ el, prev }) => {
        el.style.visibility = prev;
      });
    };
  };

  const buildOrderSummary = (order: Order) => {
    const row = order.row || {};
    const phone =
      row["Numero"] ||
      row["Numéro"] ||
      row["Téléphone"] ||
      row["Tél"] ||
      row["Tel"] ||
      row["Telephone"];
    return {
      client: row["Nom du client"] || "Sans nom",
      phone: formatPhoneNumber(phone),
      wilaya: row["Wilaya"] || "Wilaya inconnue",
      commune: row["Commune"] || "Commune inconnue",
      adresse: row["Adresse"] || "Adresse non fournie",
      status: order.status || "Sans statut",
      livreur: order.deliveryPersonName || "Livreur",
      reference: row["RÉfÉrence"] || row["Référence"] || row["Reference"] || "",
      remarque: row["Commentaire"] || row["Remarque"] || "",
    };
  };

  const printOrders = async (ordersToPrint: Order[], filename: string) => {
    if (!ordersToPrint.length) {
      alert("Aucune commande sélectionnée");
      return;
    }
    const doc = new jsPDF({ format: "a5", unit: "mm", orientation: "portrait" });
    for (let index = 0; index < ordersToPrint.length; index++) {
      const order = ordersToPrint[index];
      if (index > 0) doc.addPage();
      const canvas = await renderCardToCanvas(order);
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const maxHeight = pageHeight - 10;
      let renderWidth = pageWidth - 10;
      let renderHeight = renderWidth / ratio;
      if (renderHeight > maxHeight) {
        renderHeight = maxHeight;
        renderWidth = renderHeight * ratio;
      }
      const x = (pageWidth - renderWidth) / 2;
      const y = (pageHeight - renderHeight) / 2;
      doc.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);
    }
    doc.save(filename);
  };

  if (user?.role !== "admin") {
    return (
      <div className="admin-delivery-page">
        <p>Accès réservé à l'administrateur.</p>
      </div>
    );
  }

  return (
    <div className="admin-delivery-page">
      <div className="admin-delivery-header">
        <h1>Commandes livreurs</h1>
        <p>Visualiser, sélectionner et imprimer les bordereaux des livreurs.</p>
      </div>

      <div className="admin-delivery-toolbar">
        <button onClick={fetchOrders} className="admin-delivery-button">
          Rafraîchir
        </button>
        <button onClick={selectAll} className="admin-delivery-button">
          Tout sélectionner
        </button>
        <button onClick={clearSelection} className="admin-delivery-button">
          Vider la sélection
        </button>
        <button
          onClick={() => printOrders(selectedOrders, "bordereaux_selection_a5.pdf")}
          className="admin-delivery-button admin-delivery-button--primary"
          disabled={selectedOrders.length === 0}
        >
          Imprimer la sélection (A5)
        </button>
      </div>

      {loading && <div className="admin-delivery-state">Chargement...</div>}
      {error && <div className="admin-delivery-error">{error}</div>}

      {!loading && !error && orders.length === 0 && (
        <div className="admin-delivery-state">Aucune commande livreur.</div>
      )}

      <div className="admin-delivery-grid">
        {orders.map((order) => {
          const summary = buildOrderSummary(order);
          const row = order.row || {};
          const isSelected = selectedIds.has(order.rowId || order._id);
          const orderId = order.rowId || order._id;
          return (
            <div
              key={orderId}
              id={`admin-delivery-card-${orderId}`}
              className={`admin-delivery-card${isSelected ? " is-selected" : ""}`}
            >
              <div className="admin-delivery-card__top">
                <label className="admin-delivery-checkbox">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(orderId)}
                  />
                  <span>Sélectionner</span>
                </label>
                <span className="admin-delivery-status">{summary.status}</span>
              </div>

              <h3 className="admin-delivery-title">
                {summary.client} <span className="admin-delivery-ref">#{orderId}</span>
              </h3>
              {summary.livreur && (
                <p className="admin-delivery-meta">
                  <strong>Livreur :</strong> {getInitials(summary.livreur)}
                </p>
              )}
              <p className="admin-delivery-meta">
                <strong>Téléphone :</strong> {summary.phone}
              </p>
              <p className="admin-delivery-meta">
                <strong>Wilaya :</strong> {summary.wilaya}
              </p>
              <p className="admin-delivery-meta">
                <strong>Commune :</strong> {summary.commune}
              </p>
              {row["Produit"] && (
                <p className="admin-delivery-meta">
                  <strong>Produit :</strong> {row["Produit"]}{" "}
                  {row["Variante"] ? `(${row["Variante"]})` : ""}
                </p>
              )}
              {summary.remarque && (
                <p className="admin-delivery-meta">
                  <strong>Remarque :</strong> {summary.remarque}
                </p>
              )} 

              <div className="admin-delivery-actions">
                <button
                  onClick={() =>
                    printOrders([order], `bordereau_${order.rowId || order._id}.pdf`)
                  }
                  className="admin-delivery-button"
                >
                  Imprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AdminDeliveryOrders;
