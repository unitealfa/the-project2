import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ProductDto } from '../types';
import '../styles/Products.css';

const emptyForm: ProductDto = {
  code: '',
  name: '',
  costPrice: 0,
  salePrice: 0,
  image: '',
  variants: [],
};

const Products: React.FC = () => {
  const { token, user } = useContext(AuthContext);
  const [items, setItems] = useState<ProductDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [form, setForm] = useState<ProductDto>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const canEdit = user?.role === 'admin' || user?.role === 'gestionnaire';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setItems(
        data.map((p: any) => ({
          id: p._id || p.id,
          code: p.code,
          name: p.name,
          costPrice: p.costPrice,
          salePrice: p.salePrice,
          image: p.image,
          variants: Array.isArray(p.variants) ? p.variants.map((v: any) => ({ name: v.name, quantity: Number(v.quantity || 0) })) : [],
        }))
      );
    } catch (e: any) {
      setError(e?.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(p => {
      const inName = (p.name || '').toLowerCase().includes(q);
      const inVariants = (p.variants || []).some(v => (v.name || '').toLowerCase().includes(q));
      return inName || inVariants;
    });
  }, [items, query]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'costPrice' || name === 'salePrice' ? Number(value) : value,
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    setImageFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    } else {
      setImagePreview('');
    }
  };

  const addVariant = () => {
    setForm(prev => ({ ...prev, variants: [...(prev.variants || []), { name: '', quantity: 0 }] }));
  };

  const updateVariant = (idx: number, field: 'name' | 'quantity', value: string) => {
    setForm(prev => ({
      ...prev,
      variants: (prev.variants || []).map((v, i) => i === idx ? { ...v, [field]: field === 'quantity' ? Number(value) : value } : v)
    }));
  };

  const removeVariant = (idx: number) => {
    setForm(prev => ({
      ...prev,
      variants: (prev.variants || []).filter((_, i) => i !== idx)
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/products/${editingId}` : '/api/products';
    try {
      const fd = new FormData();
      if (form.code) fd.append('code', form.code);
      fd.append('name', form.name);
      fd.append('costPrice', String(form.costPrice));
      fd.append('salePrice', String(form.salePrice));
      // Keep existing image if no new file selected
      if (!imageFile && form.image) fd.append('image', form.image);
      if (imageFile) fd.append('image', imageFile);
      fd.append('variants', JSON.stringify(form.variants || []));

      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: fd,
      });
      if (!res.ok) throw new Error('Échec de la sauvegarde');
      await load();
      setForm(emptyForm);
      setImageFile(null);
      setImagePreview('');
      setEditingId(null);
    } catch (e: any) {
      alert(e?.message || 'Erreur');
    }
  };

  const edit = (p: ProductDto) => {
    setForm({ ...p, variants: p.variants || [] });
    setImageFile(null);
    setImagePreview('');
    setEditingId(p.id || null);
  };

  const del = async (id?: string) => {
    if (!canEdit || !id) return;
    if (!confirm('Supprimer ce produit ?')) return;
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Échec de la suppression');
      await load();
    } catch (e: any) {
      alert(e?.message || 'Erreur');
    }
  };

  return (
    <div className="products-page">
      <div className="products-page__header">
        <h1 className="products-page__title">Produits</h1>
        <p className="products-page__subtitle">
          Gérez votre catalogue de produits et leurs variantes
        </p>
      </div>

      <div className="products-panel">
        <div className="products-toolbar">
          <div className="products-toolbar__row">
            <input
              className="products-input"
              placeholder="Rechercher par nom ou variante..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>

        {canEdit && (
          <form onSubmit={submit} className="products-form">
            <div className="products-form__field">
              <label className="products-form__label">Code</label>
              <input 
                className="products-form__input"
                name="code" 
                value={form.code || ''} 
                onChange={handleChange} 
                placeholder="Code produit (optionnel)"
              />
            </div>
            <div className="products-form__field">
              <label className="products-form__label">Nom *</label>
              <input 
                className="products-form__input"
                name="name" 
                value={form.name} 
                onChange={handleChange} 
                required 
                placeholder="Nom du produit"
              />
            </div>
            <div className="products-form__field">
              <label className="products-form__label">Prix d'achat *</label>
              <input 
                className="products-form__input"
                type="number" 
                step="0.01" 
                name="costPrice" 
                value={form.costPrice} 
                onChange={handleChange} 
                required 
                placeholder="0.00"
              />
            </div>
            <div className="products-form__field">
              <label className="products-form__label">Prix de vente *</label>
              <input 
                className="products-form__input"
                type="number" 
                step="0.01" 
                name="salePrice" 
                value={form.salePrice} 
                onChange={handleChange} 
                required 
                placeholder="0.00"
              />
            </div>
            <div className="products-form__image-field">
              <label className="products-form__label">Image</label>
              <input 
                className="products-form__input"
                type="file" 
                accept="image/*" 
                onChange={handleImageChange} 
              />
              {(imagePreview || form.image) && (
                <div className="products-form__image-preview">
                  <img
                    src={imagePreview || form.image}
                    alt={form.name || 'prévisualisation'}
                  />
                </div>
              )}
            </div>
            <div className="products-form__variants">
              <h3 className="products-form__variants-title">Variantes</h3>
              <div className="products-form__variants-list">
                {(form.variants || []).map((v, idx) => (
                  <div key={idx} className="products-form__variant-item">
                    <div className="products-form__variant-field">
                      <label className="products-form__variant-label">Nom de variante</label>
                      <input 
                        className="products-form__variant-input"
                        value={v.name} 
                        onChange={e => updateVariant(idx, 'name', e.target.value)} 
                        required 
                        placeholder="ex: Rouge, Taille M"
                      />
                    </div>
                    <div className="products-form__variant-field">
                      <label className="products-form__variant-label">Quantité</label>
                      <input 
                        className="products-form__variant-input"
                        type="number" 
                        step="1" 
                        value={v.quantity} 
                        onChange={e => updateVariant(idx, 'quantity', e.target.value)} 
                        required 
                        placeholder="0"
                      />
                    </div>
                    <button 
                      type="button" 
                      className="products-form__variant-remove"
                      onClick={() => removeVariant(idx)}
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
                <button 
                  type="button" 
                  className="products-form__add-variant"
                  onClick={addVariant}
                >
                  + Ajouter une variante
                </button>
              </div>
            </div>
            <div className="products-form__actions">
              <button 
                type="submit" 
                className="products-button products-button--primary"
              >
                {editingId ? 'Mettre à jour' : 'Ajouter le produit'}
              </button>
              {editingId && (
                <button 
                  type="button" 
                  className="products-button products-button--secondary"
                  onClick={() => { setForm(emptyForm); setEditingId(null); }}
                >
                  Annuler
                </button>
              )}
            </div>
          </form>
        )}

        {loading && <div className="products-state products-state--loading">Chargement des produits...</div>}
        {error && <div className="products-state products-state--error">{error}</div>}

        {!loading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="products-empty">
                <div className="products-empty__icon">📦</div>
                <div className="products-empty__title">Aucun produit trouvé</div>
                <div className="products-empty__subtitle">
                  {query ? 'Essayez de modifier votre recherche' : 'Commencez par ajouter votre premier produit'}
                </div>
              </div>
            ) : (
              <div className="products-table-wrapper">
                <table className="products-table">
                  <thead>
                    <tr>
                      <th className="products-table__header">Code</th>
                      <th className="products-table__header">Nom</th>
                      <th className="products-table__header">Variantes</th>
                      <th className="products-table__header">Prix d'achat</th>
                      <th className="products-table__header">Prix de vente</th>
                      <th className="products-table__header">Image</th>
                      {canEdit && <th className="products-table__header">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.id} className="products-row">
                        <td className="products-table__cell">{p.code || '-'}</td>
                        <td className="products-table__cell">
                          <strong>{p.name}</strong>
                        </td>
                        <td className="products-table__cell products-table__cell--variants">
                          {(p.variants && p.variants.length) ? (
                            <div className="products-table__variants">
                              {p.variants.map((v, idx) => (
                                <span 
                                  key={idx}
                                  className={`products-table__variant ${
                                    v.quantity <= 0 ? 'products-table__variant--out-of-stock' :
                                    v.quantity <= 5 ? 'products-table__variant--low-stock' : ''
                                  }`}
                                >
                                  {v.name} ({v.quantity})
                                </span>
                              ))}
                            </div>
                          ) : '-'}
                        </td>
                        <td className="products-table__cell products-table__cell--price">
                          {p.costPrice?.toFixed(2)} €
                        </td>
                        <td className="products-table__cell products-table__cell--price">
                          {p.salePrice?.toFixed(2)} €
                        </td>
                        <td className="products-table__cell products-table__cell--image">
                          {p.image ? (
                            <img src={p.image} alt={p.name} />
                          ) : '-'}
                        </td>
                        {canEdit && (
                          <td className="products-table__cell">
                            <div className="products-table__actions">
                              <button 
                                className="products-table__action-button products-table__action-button--edit"
                                onClick={() => edit(p)}
                              >
                                Modifier
                              </button>
                              <button 
                                className="products-table__action-button products-table__action-button--delete"
                                onClick={() => del(p.id)}
                              >
                                Supprimer
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Products;


