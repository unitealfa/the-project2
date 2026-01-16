import React, { useState, useMemo, useEffect, useRef } from 'react';
import './CommuneSelectionModal.css';

interface CommuneSelectionModalProps {
  isOpen: boolean;
  wilayaCode: string | number;
  wilayaName: string;
  communes: Array<{ fr: string; ar: string }>;
  onSelect: (commune: string) => void;
  onClose: () => void;
}

const CommuneSelectionModal: React.FC<CommuneSelectionModalProps> = ({
  isOpen,
  wilayaCode,
  wilayaName,
  communes,
  onSelect,
  onClose,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filtrer les communes selon le terme de recherche
  const filteredCommunes = useMemo(() => {
    if (!searchTerm.trim()) {
      return communes;
    }
    const term = searchTerm.toLowerCase();
    return communes.filter(com =>
      com.fr.toLowerCase().includes(term) ||
      com.ar.toLowerCase().includes(term)
    );
  }, [communes, searchTerm]);

  // Focus sur l'input quand le modal s'ouvre
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setSearchTerm("");
      setHighlightedIndex(-1);
    }
  }, [isOpen]);

  // Scroll vers l'option highlightée
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < filteredCommunes.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && filteredCommunes[highlightedIndex]) {
          onSelect(filteredCommunes[highlightedIndex].fr);
        } else if (filteredCommunes.length === 1) {
          onSelect(filteredCommunes[0].fr);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="commune-selection-modal-overlay" onClick={onClose}>
      <div
        className="commune-selection-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="commune-selection-modal__header">
          <h2 className="commune-selection-modal__title">
            Sélectionner une commune
          </h2>
          <button
            type="button"
            className="commune-selection-modal__close"
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div className="commune-selection-modal__wilaya-info">
          <span className="commune-selection-modal__wilaya-badge">
            {wilayaName}
          </span>
          <span className="commune-selection-modal__count">
            {filteredCommunes.length} {filteredCommunes.length === 1 ? 'commune' : 'communes'}
          </span>
        </div>

        <div className="commune-selection-modal__search">
          <svg
            className="commune-selection-modal__search-icon"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9.16667 15.8333C12.8486 15.8333 15.8333 12.8486 15.8333 9.16667C15.8333 5.48477 12.8486 2.5 9.16667 2.5C5.48477 2.5 2.5 5.48477 2.5 9.16667C2.5 12.8486 5.48477 15.8333 9.16667 15.8333Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M17.5 17.5L13.875 13.875"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className="commune-selection-modal__input"
            placeholder="Rechercher une commune..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setHighlightedIndex(-1);
            }}
            onKeyDown={handleKeyDown}
          />
          {searchTerm && (
            <button
              type="button"
              className="commune-selection-modal__clear"
              onClick={() => {
                setSearchTerm("");
                setHighlightedIndex(-1);
                searchInputRef.current?.focus();
              }}
              aria-label="Effacer la recherche"
            >
              ×
            </button>
          )}
        </div>

        <div
          ref={listRef}
          className="commune-selection-modal__list"
        >
          {filteredCommunes.length === 0 ? (
            <div className="commune-selection-modal__empty">
              <p>Aucune commune trouvée</p>
              <p className="commune-selection-modal__empty-hint">
                Essayez de modifier votre recherche
              </p>
            </div>
          ) : (
            filteredCommunes.map((commune, index) => {
              const isHighlighted = index === highlightedIndex;
              return (
                <button
                  key={commune.fr}
                  type="button"
                  className={`commune-selection-modal__item ${
                    isHighlighted ? 'commune-selection-modal__item--highlighted' : ''
                  }`}
                  onClick={() => onSelect(commune.fr)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <span className="commune-selection-modal__item-name">
                    {commune.fr}
                  </span>
                  {commune.ar && (
                    <span className="commune-selection-modal__item-ar">
                      {commune.ar}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="commune-selection-modal__footer">
          <button
            type="button"
            className="commune-selection-modal__cancel"
            onClick={onClose}
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommuneSelectionModal;
