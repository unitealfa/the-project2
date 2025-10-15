import React, { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { ProductDto } from '../types';

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
    <div style={{ padding: '1rem' }}>
      <h2>Produits</h2>

      <div style={{ display: 'flex', gap: 8, margin: '0.5rem 0' }}>
        <input
          placeholder="Rechercher par nom ou variante"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ padding: '0.4rem 0.6rem', width: 280 }}
        />
      </div>

      {canEdit && (
        <form onSubmit={submit} style={{ display: 'grid', gap: 8, maxWidth: 960, gridTemplateColumns: 'repeat(6, 1fr)', alignItems: 'end', margin: '1rem 0' }}>
          <label style={{ display: 'grid' }}>
            <span>Code</span>
            <input name="code" value={form.code || ''} onChange={handleChange} />
          </label>
          <label style={{ display: 'grid' }}>
            <span>Nom</span>
            <input name="name" value={form.name} onChange={handleChange} required />
          </label>
          <label style={{ display: 'grid' }}>
            <span>Prix d'achat</span>
            <input type="number" step="0.01" name="costPrice" value={form.costPrice} onChange={handleChange} required />
          </label>
          <label style={{ display: 'grid' }}>
            <span>Prix de vente</span>
            <input type="number" step="0.01" name="salePrice" value={form.salePrice} onChange={handleChange} required />
          </label>
          <div style={{ display: 'grid' }}>
            <span>Image</span>
            <input type="file" accept="image/*" onChange={handleImageChange} />
            {(imagePreview || form.image) && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={imagePreview || form.image}
                  alt={form.name || 'prévisualisation'}
                  style={{ maxHeight: 80 }}
                />
              </div>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1', border: '1px solid #eee', padding: 8, borderRadius: 4 }}>
            <strong>Variantes</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              {(form.variants || []).map((v, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <label style={{ display: 'grid' }}>
                    <span>Nom de variante</span>
                    <input value={v.name} onChange={e => updateVariant(idx, 'name', e.target.value)} required />
                  </label>
                  <label style={{ display: 'grid' }}>
                    <span>Quantité</span>
                    <input type="number" step="1" value={v.quantity} onChange={e => updateVariant(idx, 'quantity', e.target.value)} required />
                  </label>
                  <button type="button" onClick={() => removeVariant(idx)}>Supprimer</button>
                </div>
              ))}
              <div>
                <button type="button" onClick={addVariant}>+ Ajouter une variante</button>
              </div>
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit">{editingId ? 'Mettre à jour' : 'Ajouter'}</button>
            {editingId && (
              <button type="button" style={{ marginLeft: 8 }} onClick={() => { setForm(emptyForm); setEditingId(null); }}>Annuler</button>
            )}
          </div>
        </form>
      )}

      {loading && <p>Chargement…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {!loading && !error && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 8 }}>Code</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 8 }}>Nom</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 8 }}>Variantes (stock)</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 8 }}>Prix d'achat</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc', padding: 8 }}>Prix de vente</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 8 }}>Image</th>
                {canEdit && <th style={{ borderBottom: '1px solid #ccc', padding: 8 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: 8 }}>{p.code || '-'}</td>
                  <td style={{ padding: 8 }}>{p.name}</td>
                  <td style={{ padding: 8 }}>{(p.variants && p.variants.length) ? p.variants.map(v => `${v.name} (${v.quantity})`).join(', ') : '-'}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{p.costPrice?.toFixed(2)}</td>
                  <td style={{ padding: 8, textAlign: 'right' }}>{p.salePrice?.toFixed(2)}</td>
                  <td style={{ padding: 8 }}>
                    {p.image ? <img src={p.image} alt={p.name} style={{ maxHeight: 40 }} /> : '-'}
                  </td>
                  {canEdit && (
                    <td style={{ padding: 8 }}>
                      <button onClick={() => edit(p)}>Modifier</button>
                      <button style={{ marginLeft: 8 }} onClick={() => del(p.id)}>Supprimer</button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} style={{ padding: 12 }}>Aucun produit trouvé.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Products;


