import React, { useContext, useEffect, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { AuthContext } from "../context/AuthContext";
import { apiFetch } from "../utils/api";
import "../styles/DeliveryPerson.css";

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
  deliveryType: "api_dhd" | "api_sook" | "livreur";
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
  if (!digits) return "N/A";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("213") && digits.length >= 12) digits = digits.slice(3);
  if (digits.length === 9) digits = `0${digits}`;
  else if (!digits.startsWith("0") && digits.length > 9) digits = `0${digits.slice(-9)}`;
  else if (!digits.startsWith("0")) digits = `0${digits}`;
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(0, 10);
  return digits || "N/A";
};

const normalizeStatus = (status: string) =>
  status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") ?? "";

const isOrderCompleted = (status: string) => {
  const normalized = normalizeStatus(status);
  return (
    normalized.includes("delivered") ||
    normalized.includes("livree") ||
    normalized.includes("returned") ||
    normalized.includes("retour") ||
    normalized.includes("annule")
  );
};

const DeliveryPerson: React.FC = () => {
  const { user } = useContext(AuthContext);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.role === "livreur") {
      fetchOrders();
    }
  }, [user]);

  const fetchOrders = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch(
        `/api/orders/delivery-person/${user.id}/orders`
      );
      const data = await response.json();
      if (data.success) {
        const activeOrders = (data.orders as Order[]).filter(
          (order) => !isOrderCompleted(order.status)
        );
        setOrders(activeOrders);
      } else {
        setError(
          data.message || "Erreur lors de la récupération des commandes"
        );
      }
    } catch (err) {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  const handleOrderAction = async (
    orderId: string,
    action: "validate" | "cancel"
  ) => {
    try {
      const response = await apiFetch("/api/orders/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rowId: orderId,
          status: action === "validate" ? "delivered" : "returned",
          deliveryType: "livreur",
          deliveryPersonId: user?.id,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setOrders((prev) => prev.filter((order) => order.rowId !== orderId));
        alert(
          action === "validate"
            ? "Commande validée avec succès"
            : "Commande annulée"
        );
      } else {
        alert(data.message || "Erreur lors de la mise à jour");
      }
    } catch (err) {
      alert("Erreur de connexion");
    }
  };

  const handleDownloadBordereau = async (order: Order) => {
    try {
      const canvas = await renderCardToCanvas(order);
      const pdf = new jsPDF({ format: "a5", unit: "mm", orientation: "portrait" });
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
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
      pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);
      pdf.save(`bordereau_${order.rowId || order._id}.pdf`);
    } catch (err) {
      console.error("Erreur lors du téléchargement du bordereau", err);
      alert("Erreur lors du téléchargement du bordereau");
    }
  };

  const handlePreviewBordereau = async (order: Order) => {
    try {
      const canvas = await renderCardToCanvas(order);
      const pdf = new jsPDF({ format: "a5", unit: "mm", orientation: "portrait" });
      const imgData = canvas.toDataURL("image/png");
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
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
      pdf.addImage(imgData, "PNG", x, y, renderWidth, renderHeight);
      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error("Erreur lors de la prévisualisation du bordereau", err);
      alert("Erreur lors de la prévisualisation du bordereau");
    }
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

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

  const renderCardToCanvas = async (order: Order) => {
    const cardId = `delivery-person-card-${order.rowId || order._id}`;
    const card = document.getElementById(cardId);
    if (!card) {
      throw new Error(
        `Carte introuvable pour la commande ${order.rowId || order._id}`
      );
    }
    const cleanup = hideForPrint(card, [
      ".delivery-person-order-actions",
      ".delivery-person-status",
    ]);
    const canvas = await html2canvas(card, {
      scale: 2,
      useCORS: true,
      windowWidth: card.scrollWidth,
    });
    cleanup();
    return canvas;
  };

  const getStatusColor = (status: string) => {
    const normalized = normalizeStatus(status);
    if (normalized.includes("livree") || normalized.includes("delivered"))
      return "status-delivered";
    if (normalized.includes("retour") || normalized.includes("annule"))
      return "status-cancelled";
    if (normalized.includes("cours")) return "status-in-progress";
    if (normalized.includes("assigne")) return "status-assigned";
    return "status-pending";
  };

  if (user?.role !== "livreur") {
    return (
      <div className="delivery-person-page">
        <div className="delivery-person-error">
          <h2>Accès non autorisé</h2>
          <p>Connectez-vous en tant que livreur pour accéder à cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="delivery-person-page">
      <header className="delivery-person-header">
        <h1>Mes Commandes</h1>
        <p>Gérez vos commandes assignées</p>
      </header>

      {loading && (
        <div className="delivery-person-loading">
          <p>Chargement des commandes...</p>
        </div>
      )}

      {error && (
        <div className="delivery-person-error">
          <p>{error}</p>
          <button onClick={fetchOrders} className="delivery-person-retry">
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="delivery-person-content">
          {orders.length === 0 ? (
            <div className="delivery-person-empty">
              <h3>Aucune commande assignée</h3>
              <p>Vous n'avez actuellement aucune commande à traiter.</p>
            </div>
          ) : (
            <div className="delivery-person-orders">
              {orders.map((order) => {
                const row = order.row || {};
                const primaryPhone = formatPhoneNumber(
                  row["Numero"] ?? row["Numéro"] ?? row["Téléphone"]
                );
                const secondaryPhone = formatPhoneNumber(
                  row["Numero 2"] ?? row["Téléphone 2"]
                );
                const phoneParts = [primaryPhone, secondaryPhone].filter(
                  (phone) => phone && phone !== "N/A"
                );
                const phoneDisplay =
                  phoneParts.length > 0 ? phoneParts.join(" / ") : "N/A";

                return (
                  <div
                    key={order._id}
                    id={`delivery-person-card-${order.rowId || order._id}`}
                    className="delivery-person-order"
                  >
                    <div className="delivery-person-order-header">
                      <h3>Commande #{order.rowId}</h3>
                      <span
                        className={`delivery-person-status ${getStatusColor(
                          order.status
                        )}`}
                      >
                        {order.status}
                      </span>
                    </div>

                    <div className="delivery-person-order-details">
                      <div className="delivery-person-order-info">
                        <p>
                          <strong>Assignée le:</strong>{" "}
                          {formatDate(order.createdAt)}
                        </p>
                        {order.tracking && (
                          <p>
                            <strong>Tracking:</strong> {order.tracking}
                          </p>
                        )}
                      </div>

                      <div className="delivery-person-order-client">
                        <h4>Informations client</h4>
                        <p>
                          <strong>Nom:</strong>{" "}
                          {String(row["Nom du client"] || "N/A")}
                        </p>
                        <p>
                          <strong>Téléphone:</strong> {phoneDisplay}
                        </p>
                        <p>
                          <strong>Commune de la commande:</strong>{" "}
                          {String(row["Commune"] || "N/A")}
                        </p>
                        <p>
                          <strong>Wilaya:</strong>{" "}
                          {String(row["Wilaya"] || "N/A")}
                        </p>
                      </div>
                    </div>

                    <div className="delivery-person-order-actions">
                      {!isOrderCompleted(order.status) && (
                        <>
                          <button
                            onClick={() =>
                              handleOrderAction(order.rowId, "validate")
                            }
                            className="delivery-person-btn delivery-person-btn--success"
                          >
                            Valider la livraison
                          </button>
                          <button
                            onClick={() =>
                              handleOrderAction(order.rowId, "cancel")
                            }
                            className="delivery-person-btn delivery-person-btn--danger"
                          >
                            Annuler (Retour)
                          </button>
                        </>
                      )}
                    </div>

                    {isOrderCompleted(order.status) && (
                      <div className="delivery-person-order-completed">
                        <p className="delivery-person-completed-message">
                          {normalizeStatus(order.status).includes("livree") ||
                          normalizeStatus(order.status).includes("delivered")
                            ? "Commande livrée avec succès"
                            : "Commande annulée"}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DeliveryPerson;
