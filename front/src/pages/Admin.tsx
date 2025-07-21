// front/src/pages/Admin.tsx

import React, { useEffect, useState, useContext } from "react";
import { useParams, Link } from "react-router-dom";
import { User } from "../types";
import { AuthContext } from "../context/AuthContext";

const Admin: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token, user } = useContext(AuthContext);
  const [adminData, setAdminData] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !id) return;
    (async () => {
      try {
        const res = await fetch(`/api/users/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          throw new Error(`Erreur ${res.status}`);
        }
        const data: User = await res.json();
        setAdminData(data);
      } catch (err: any) {
        setError(err.message);
      }
    })();
  }, [id, token]);

  // Si pas connecté ou pas admin
  if (!user || user.role !== "admin") {
    return (
      <p style={{ textAlign: "center", marginTop: "2rem" }}>
        Accès non autorisé
      </p>
    );
  }
  // Erreur ou chargement
  if (error) {
    return (
      <p style={{ textAlign: "center", marginTop: "2rem" }}>Erreur : {error}</p>
    );
  }
  if (!adminData) {
    return (
      <p style={{ textAlign: "center", marginTop: "2rem" }}>Chargement…</p>
    );
  }

  return (
    <div style={{ maxWidth: 500, margin: "2rem auto", textAlign: "center" }}>
      <h1>
        Bienvenue {adminData.firstName} {adminData.lastName}
      </h1>
      <p>
        <strong>Email:</strong> {adminData.email}
      </p>
      <p>
        <strong>Rôle:</strong> {adminData.role}
      </p>

      <div style={{ marginTop: "2rem" }}>
        <Link
          to={`/admin/${adminData.id}/team`}
          style={{
            marginRight: "1rem",
            textDecoration: "none",
            background: "#28a745",
            color: "white",
            padding: "0.5rem 1rem",
            borderRadius: 4,
          }}
        >
          Mon équipe
        </Link>
      </div>
    </div>
  );
};

export default Admin;
