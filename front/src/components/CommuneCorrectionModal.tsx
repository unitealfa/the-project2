import React, { useState, useEffect } from 'react';
import { getCommunesByWilaya } from '../utils/communes';
import './CommuneCorrectionModal.css';

interface CommuneCorrectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (wilayaCode: number, communeName: string) => void;
    initialCommune: string;
    initialWilayaCode: number;
}

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
    { id: 49, name: "Timimoun" },
    { id: 50, name: "Bordj Badji Mokhtar" },
    { id: 51, name: "Ouled Djellal" },
    { id: 52, name: "Beni Abbes" },
    { id: 53, name: "In Salah" },
    { id: 54, name: "In Guezzam" },
    { id: 55, name: "Touggourt" },
    { id: 56, name: "Djanet" },
    { id: 57, name: "El M'Ghair" },
    { id: 58, name: "El Meniaa" },
];

const CommuneCorrectionModal: React.FC<CommuneCorrectionModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    initialCommune,
    initialWilayaCode,
}) => {
    const [selectedWilaya, setSelectedWilaya] = useState<number>(initialWilayaCode || 16);
    const [selectedCommune, setSelectedCommune] = useState<string>(initialCommune || '');
    const [availableCommunes, setAvailableCommunes] = useState<{ fr: string; ar: string }[]>([]);

    useEffect(() => {
        if (isOpen) {
            setSelectedWilaya(initialWilayaCode || 16);
            setSelectedCommune(initialCommune || '');
        }
    }, [isOpen, initialWilayaCode, initialCommune]);

    useEffect(() => {
        const communes = getCommunesByWilaya(selectedWilaya);
        setAvailableCommunes(communes);
    }, [selectedWilaya]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <div className="modal-header">
                    <h2 className="modal-title">
                        <span className="modal-title-icon">⚠️</span>
                        Correction requise
                    </h2>
                    <p className="modal-description">
                        L'adresse semble incorrecte ou la commune a été rejetée par l'API. Veuillez sélectionner la bonne localisation.
                    </p>
                </div>

                <div className="modal-form-group">
                    <label className="modal-label">Wilaya</label>
                    <select
                        className="modal-select"
                        value={selectedWilaya}
                        onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setSelectedWilaya(val);
                            setSelectedCommune('');
                        }}
                    >
                        {WILAYAS.map((w) => (
                            <option key={w.id} value={w.id}>
                                {w.id} - {w.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="modal-form-group">
                    <label className="modal-label">Commune</label>
                    <select
                        className="modal-select"
                        value={selectedCommune}
                        onChange={(e) => setSelectedCommune(e.target.value)}
                    >
                        <option value="">-- Sélectionner une commune --</option>
                        {availableCommunes.map((c) => (
                            <option key={c.fr} value={c.fr}>
                                {c.fr} {c.ar ? `(${c.ar})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="modal-footer">
                    <button
                        className="modal-btn modal-btn-secondary"
                        onClick={onClose}
                    >
                        Annuler
                    </button>
                    <button
                        className="modal-btn modal-btn-primary"
                        onClick={() => onConfirm(selectedWilaya, selectedCommune)}
                        disabled={!selectedWilaya || !selectedCommune}
                    >
                        Confirmer et Réessayer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CommuneCorrectionModal;
