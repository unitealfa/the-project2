import React, { useState, useEffect } from 'react';
import { getCommunesByWilaya } from '../utils/communes';

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

        // If the currently selected commune is not in the new list, clear selection or try to match
        // Or just let the user pick
    }, [selectedWilaya]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
        }}>
            <div style={{
                backgroundColor: 'white',
                padding: '24px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                width: '400px',
                maxWidth: '90vw',
            }}>
                <h2 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.25rem', color: '#dc2626' }}>
                    ⚠️ Correction requise
                </h2>
                <p style={{ marginBottom: '20px', color: '#4b5563' }}>
                    L'API a rejeté la commune ou la wilaya. L'adresse semble incorrecte. Veuillez corriger manuellement.
                </p>

                <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Wilaya</label>
                    <select
                        value={selectedWilaya}
                        onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setSelectedWilaya(val);
                            setSelectedCommune(''); // Reset commune when wilaya changes
                        }}
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                        }}
                    >
                        {WILAYAS.map((w) => (
                            <option key={w.id} value={w.id}>
                                {w.id} - {w.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ marginBottom: '24px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Commune</label>
                    <select
                        value={selectedCommune}
                        onChange={(e) => setSelectedCommune(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                        }}
                    >
                        <option value="">-- Sélectionner une commune --</option>
                        {availableCommunes.map((c) => (
                            <option key={c.fr} value={c.fr}>
                                {c.fr} {c.ar ? `(${c.ar})` : ''}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: '1px solid #d1d5db',
                            backgroundColor: 'white',
                            cursor: 'pointer',
                        }}
                    >
                        Annuler
                    </button>
                    <button
                        onClick={() => onConfirm(selectedWilaya, selectedCommune)}
                        disabled={!selectedWilaya || !selectedCommune}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '4px',
                            border: 'none',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            cursor: (!selectedWilaya || !selectedCommune) ? 'not-allowed' : 'pointer',
                            opacity: (!selectedWilaya || !selectedCommune) ? 0.7 : 1,
                        }}
                    >
                        Confirmer et Réessayer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CommuneCorrectionModal;
