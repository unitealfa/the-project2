// Utilitaires pour extraire les informations produit depuis une ligne de commande
// et décrémenter automatiquement le stock

import { ProductService } from '../products/product.service';

const normalizeKey = (key: string): string => {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const PRODUCT_KEY_KEYWORDS = ['produit', 'product', 'article'];
const VARIANT_KEY_CANDIDATES = ['variante', 'variant', 'taille', 'size', 'couleur', 'color'];

const isMeaningfulVariantName = (value: string): boolean => {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed === 'default' || trimmed === 'defaut') {
    return false;
  }
  return trimmed.length >= 1;
};

interface ProductInfo {
  id?: string;
  code?: string;
  name?: string;
  variant: string;
  quantity: number;
}

/**
 * Extrait le label du produit depuis une ligne de commande
 */
export const extractProductLabel = (row: Record<string, unknown>): string => {
  for (const [rawKey, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(rawKey);
    if (!normalizedKey) continue;
    if (PRODUCT_KEY_KEYWORDS.some((keyword) => normalizedKey.includes(keyword))) {
      // Exclure les champs qui sont clairement des codes/numéros
      if (normalizedKey.includes('(no)') || 
          normalizedKey.includes('numero') || 
          normalizedKey.includes('code') ||
          normalizedKey.includes('no)') ||
          normalizedKey === 'produit (no)') {
        continue;
      }
      const trimmed = String(value ?? '').trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  // Fallback sur le champ "Produit" standard
  const produitValue = String(row['Produit'] ?? '').trim();
  return produitValue;
};

/**
 * Sépare le label du produit en nom de base et variante
 * Gère les cas avec plusieurs séparateurs comme "nom / variante1 / variante2"
 */
const splitProductLabel = (
  label: string
): { baseName: string; variant: string | null } => {
  const trimmed = label.trim();
  if (!trimmed) {
    return { baseName: '', variant: null };
  }

  const cleanupBaseName = (value: string) =>
    value.replace(/[-–—:|]+\s*$/, '').trim();
  const sanitizeVariant = (value: string) =>
    value
      .replace(/^[\s-–—:|\[\]]+/, '')
      .replace(/[\s\[\]]+$/, '')
      .replace(/\s+/g, ' ')
      .trim();

  // Essayer les parenthèses
  const parenthesisMatch = trimmed.match(/\(([^()]+)\)\s*$/);
  if (parenthesisMatch && typeof parenthesisMatch.index === 'number') {
    const variant = sanitizeVariant(parenthesisMatch[1]);
    const baseName = cleanupBaseName(trimmed.slice(0, parenthesisMatch.index));
    if (variant) {
      return {
        baseName: baseName || trimmed,
        variant,
      };
    }
  }

  // Essayer les crochets
  const bracketMatch = trimmed.match(/\[([^\[\]]+)\]\s*$/);
  if (bracketMatch && typeof bracketMatch.index === 'number') {
    const variant = sanitizeVariant(bracketMatch[1]);
    const baseName = cleanupBaseName(trimmed.slice(0, bracketMatch.index));
    if (variant) {
      return {
        baseName: baseName || trimmed,
        variant,
      };
    }
  }

  // Essayer les séparateurs (chercher le premier séparateur significatif)
  // Pour "nom / variante1 / variante2", on prend "nom" comme base et "variante1 / variante2" comme variante
  const separators = [' / ', ' - ', ' – ', ' — ', ' : ', ' | '];
  for (const separator of separators) {
    const index = trimmed.indexOf(separator);
    if (index > 0 && index < trimmed.length - separator.length) {
      // Prendre tout ce qui suit le premier séparateur comme variante
      const variant = sanitizeVariant(trimmed.slice(index + separator.length));
      const baseName = cleanupBaseName(trimmed.slice(0, index));
      if (variant && baseName) {
        return {
          baseName,
          variant,
        };
      }
    }
  }

  return { baseName: trimmed, variant: null };
};

/**
 * Extrait la variante depuis une ligne de commande
 */
const extractVariantValue = (row: Record<string, unknown>): string => {
  let defaultLikeVariant: string | null = null;
  
  // Chercher dans les champs de variante
  for (const [rawKey, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(rawKey);
    if (VARIANT_KEY_CANDIDATES.some((candidate) => normalizedKey.includes(candidate))) {
      const trimmed = String(value ?? '').trim();
      if (!trimmed) {
        continue;
      }
      if (isMeaningfulVariantName(trimmed)) {
        return trimmed;
      }
      defaultLikeVariant = defaultLikeVariant ?? 'default';
    }
  }

  // Chercher dans le label du produit
  const productLabel = extractProductLabel(row);
  if (productLabel) {
    const { variant } = splitProductLabel(productLabel);
    if (variant) {
      if (isMeaningfulVariantName(variant)) {
        return variant;
      }
      defaultLikeVariant = defaultLikeVariant ?? 'default';
    }
  }
  
  return defaultLikeVariant ?? 'default';
};

/**
 * Extrait la quantité depuis une ligne de commande
 */
const extractQuantityValue = (row: Record<string, unknown>): number => {
  const rawQuantity = String(
    row['Quantité'] || row['Quantite'] || row['Qte'] || '1'
  ).replace(/[^\d]/g, '');
  const parsed = parseInt(rawQuantity, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? 1 : parsed;
};

/**
 * Extrait le code produit depuis une ligne de commande
 */
const extractProductCode = (row: Record<string, unknown>): string => {
  const candidates = [
    'Code',
    'code',
    'SKU',
    'Sku',
    'Référence',
    'Reference',
  ];
  for (const key of candidates) {
    if (key in row) {
      const trimmed = String(row[key] ?? '').trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
};

/**
 * Extrait l'ID du produit depuis une ligne de commande
 */
const extractProductId = (row: Record<string, unknown>): string | undefined => {
  const candidates = [
    'Product ID',
    'ProductID',
    'productId',
    'product_id',
    'Produit ID',
    'ProduitID',
    'ID Produit',
    'ID Produit',
    'ProductId',
  ];
  
  for (const key of candidates) {
    if (key in row) {
      const value = String(row[key] ?? '').trim();
      if (value) {
        return value;
      }
    }
  }
  
  // Chercher dans tous les champs qui contiennent "product" et "id"
  for (const [rawKey, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(rawKey);
    if (normalizedKey.includes('product') && normalizedKey.includes('id')) {
      const trimmed = String(value ?? '').trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  
  return undefined;
};

/**
 * Extrait le nom du produit depuis une ligne de commande (champ direct)
 */
const extractProductNameDirect = (row: Record<string, unknown>): string | undefined => {
  const candidates = [
    'Product Name',
    'ProductName',
    'productName',
    'product_name',
    'Produit Name',
    'ProduitName',
    'Nom Produit',
    'Nom du produit',
  ];
  
  for (const key of candidates) {
    if (key in row) {
      const value = String(row[key] ?? '').trim();
      if (value) {
        return value;
      }
    }
  }
  
  // Chercher dans tous les champs qui contiennent "product" et "name"
  for (const [rawKey, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(rawKey);
    if (normalizedKey.includes('product') && normalizedKey.includes('name')) {
      const trimmed = String(value ?? '').trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  
  return undefined;
};

/**
 * Extrait les informations produit depuis une ligne de commande
 * Priorité: ID produit > champs directs (nom, variante) > extraction depuis label
 */
export const extractProductInfo = (row: Record<string, unknown>): ProductInfo | null => {
  try {
    const quantity = extractQuantityValue(row);
    if (quantity <= 0) {
      return null;
    }

    // Priorité 1: Chercher l'ID du produit directement
    const productId = extractProductId(row);
    if (productId) {
      // Si on a l'ID, chercher la variante directement
      const variantFromRow = extractVariantValue(row);
      return {
        id: productId,
        variant: variantFromRow,
        quantity,
      };
    }

    // Priorité 2: Chercher le nom et la variante directement
    const productNameDirect = extractProductNameDirect(row);
    const variantFromRow = extractVariantValue(row);
    
    if (productNameDirect && variantFromRow && variantFromRow !== 'default') {
      const code = extractProductCode(row);
      return {
        code: code || undefined,
        name: productNameDirect,
        variant: variantFromRow,
        quantity,
      };
    }

    // Priorité 3: Extraction depuis le label (méthode précédente)
    const rawProductLabel = extractProductLabel(row) || String(row['Produit'] ?? '').trim();
    if (!rawProductLabel) {
      return null;
    }

    const { baseName: productNameForStock, variant: variantFromLabel } =
      splitProductLabel(rawProductLabel);
    const variant =
      variantFromRow === 'default' && variantFromLabel
        ? variantFromLabel
        : variantFromRow;
    const code = extractProductCode(row);

    return {
      code: code || undefined,
      name: productNameForStock || rawProductLabel || undefined,
      variant,
      quantity,
    };
  } catch (error) {
    console.error('Erreur lors de l\'extraction des informations produit:', error);
    return null;
  }
};

/**
 * Trouve une variante dans un produit avec comparaison flexible
 */
const findVariantInProduct = async (
  product: any,
  variant: string
): Promise<string | null> => {
  const normalizedVariant = normalizeForComparison(variant);
  const variantParts = normalizedVariant.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p);
  
  console.log(`   Recherche de la variante "${variant}" (normalisée: "${normalizedVariant}")`);
  console.log(`   Parties de la variante:`, variantParts);
  
  for (const candidateVariant of product.variants || []) {
    const candidateVariantName = normalizeForComparison(candidateVariant.name);
    console.log(`   Comparaison avec "${candidateVariant.name}" (normalisée: "${candidateVariantName}")`);
    
    // Comparaison exacte
    if (candidateVariantName === normalizedVariant) {
      console.log(`   ✅ Correspondance exacte trouvée: "${candidateVariant.name}"`);
      return candidateVariant.name;
    }
    
    // Comparaison avec les parties de la variante
    for (const part of variantParts) {
      if (candidateVariantName === part || candidateVariantName.includes(part) || part.includes(candidateVariantName)) {
        console.log(`   ✅ Correspondance par partie trouvée: "${candidateVariant.name}" (partie: "${part}")`);
        return candidateVariant.name;
      }
    }
    
    // Comparaison inverse
    const candidateVariantParts = candidateVariantName.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p);
    for (const part of variantParts) {
      for (const candidatePart of candidateVariantParts) {
        if (part === candidatePart || part.includes(candidatePart) || candidatePart.includes(part)) {
          console.log(`   ✅ Correspondance inverse trouvée: "${candidateVariant.name}" (partie: "${part}" = "${candidatePart}")`);
          return candidateVariant.name;
        }
      }
    }
  }
  
  console.log(`   ❌ Aucune correspondance trouvée pour "${variant}"`);
  return null;
};

/**
 * Décrémente le stock d'une variante (permet stocks négatifs)
 */
const decrementVariantStock = async (
  product: any,
  variantName: string,
  quantity: number
): Promise<void> => {
  const normalizedVariantName = normalizeForComparison(variantName);
  const variantIndex = product.variants.findIndex(
    (v: any) => normalizeForComparison(v.name) === normalizedVariantName
  );
  
  if (variantIndex === -1) {
    throw new Error(`Variante "${variantName}" non trouvée dans le produit`);
  }
  
  const currentQuantity = Number(product.variants[variantIndex].quantity) || 0;
  const nextQuantity = currentQuantity - quantity;
  
  // Permettre les stocks négatifs
  product.variants[variantIndex].quantity = nextQuantity;
  await product.save();
  
  console.log(`   Stock décrémenté: ${currentQuantity} -> ${nextQuantity} (quantité: ${quantity})`);
};

/**
 * Normalise un texte pour la comparaison (gère l'arabe et les espaces)
 * Pour l'arabe, on garde les caractères tels quels (pas de normalisation NFD)
 */
const normalizeForComparison = (text: string): string => {
  if (!text) return '';
  
  // Normaliser les espaces
  let normalized = text.replace(/\s+/g, ' ').trim();
  
  // Vérifier si le texte contient de l'arabe
  const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(normalized);
  
  if (hasArabic) {
    // Pour l'arabe, on garde les caractères tels quels (pas de normalisation NFD)
    // On normalise juste les espaces et on met en minuscule (si applicable)
    return normalized;
  } else {
    // Pour les autres langues, on normalise NFD pour enlever les accents
    return normalized
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
};

/**
 * Recherche flexible d'un produit avec plusieurs tentatives
 */
const findProductFlexible = async (
  productService: ProductService,
  code: string | undefined,
  name: string | undefined,
  variant: string
): Promise<{ product: any; matchedVariant: string } | null> => {
  // Import dynamique pour éviter les dépendances circulaires
  const Product = (await import('../products/product.model')).default;

  // Tentative 1: Recherche exacte par code
  if (code) {
    const product = await Product.findOne({ code: code.trim() });
    if (product) {
      // Chercher la variante dans le produit
      const normalizedVariant = normalizeForComparison(variant);
      const variantParts = normalizedVariant.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p);
      
      for (const candidateVariant of product.variants || []) {
        const candidateVariantName = normalizeForComparison(candidateVariant.name);
        
        // Comparaison exacte
        if (candidateVariantName === normalizedVariant) {
          return { product, matchedVariant: candidateVariant.name };
        }
        
        // Comparaison avec les parties de la variante
        for (const part of variantParts) {
          if (candidateVariantName === part || candidateVariantName.includes(part) || part.includes(candidateVariantName)) {
            return { product, matchedVariant: candidateVariant.name };
          }
        }
        
        // Comparaison inverse
        const candidateVariantParts = candidateVariantName.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p);
        for (const part of variantParts) {
          for (const candidatePart of candidateVariantParts) {
            if (part === candidatePart || part.includes(candidatePart) || candidatePart.includes(part)) {
              return { product, matchedVariant: candidateVariant.name };
            }
          }
        }
      }
    }
  }

  // Tentative 2: Recherche flexible par nom
  if (name) {
    const normalizedName = normalizeForComparison(name);
    
    // Chercher tous les produits dont le nom correspond (recherche partielle)
    const candidates = await Product.find({
      name: { $regex: new RegExp(normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    });

    for (const candidate of candidates) {
      const candidateName = normalizeForComparison(candidate.name);
      if (candidateName === normalizedName || candidateName.includes(normalizedName) || normalizedName.includes(candidateName)) {
        // Essayer de trouver la variante
        const normalizedVariant = normalizeForComparison(variant);
        const variantParts = normalizedVariant.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p);
        
        // Chercher la variante dans le produit
        for (const candidateVariant of candidate.variants || []) {
          const candidateVariantName = normalizeForComparison(candidateVariant.name);
          
          // Comparaison exacte
          if (candidateVariantName === normalizedVariant) {
            return { product: candidate, matchedVariant: candidateVariant.name };
          }
          
          // Comparaison avec les parties de la variante
          for (const part of variantParts) {
            if (candidateVariantName === part || candidateVariantName.includes(part) || part.includes(candidateVariantName)) {
              return { product: candidate, matchedVariant: candidateVariant.name };
            }
          }
          
          // Comparaison inverse (la variante du produit contient la variante recherchée)
          const candidateVariantParts = candidateVariantName.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p);
          for (const part of variantParts) {
            for (const candidatePart of candidateVariantParts) {
              if (part === candidatePart || part.includes(candidatePart) || candidatePart.includes(part)) {
                return { product: candidate, matchedVariant: candidateVariant.name };
              }
            }
          }
        }
      }
    }
  }

  return null;
};

/**
 * Décrémente automatiquement le stock pour une commande livrée
 * Permet les stocks négatifs
 * Compare le nom et la variante de la commande avec les produits du stock
 * Ne lance pas d'erreur si le produit n'est pas trouvé (la commande passe quand même à delivered)
 */
export const decrementStockForDeliveredOrder = async (
  row: Record<string, unknown>,
  rowId: string
): Promise<void> => {
  const productInfo = extractProductInfo(row);
  if (!productInfo) {
    // Pas d'erreur, juste un log silencieux
    console.log(`ℹ️ Impossible d'extraire les informations produit pour la commande ${rowId} - la commande passe quand même à delivered`);
    return;
  }

  const { id, code, name, variant, quantity } = productInfo;

  // Besoin au minimum d'un nom et d'une variante pour chercher
  if (!name || !variant || quantity <= 0) {
    // Pas d'erreur, juste un log silencieux
    console.log(`ℹ️ Informations produit incomplètes pour la commande ${rowId} (nom: ${name || 'N/A'}, variante: ${variant || 'N/A'}) - la commande passe quand même à delivered`);
    return;
  }

  try {
    const Product = (await import('../products/product.model')).default;
    
    // Chercher tous les produits qui correspondent au nom (recherche flexible)
    const normalizedName = normalizeForComparison(name);
    const normalizedVariant = normalizeForComparison(variant);
    const variantParts = normalizedVariant.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p);
    
    // Recherche par nom (recherche partielle pour être plus flexible)
    const products = await Product.find({
      name: { $regex: new RegExp(normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
    });
    
    if (products.length === 0) {
      // Pas d'erreur, juste un log silencieux
      console.log(`ℹ️ Aucun produit trouvé avec le nom "${name}" pour la commande ${rowId} - la commande passe quand même à delivered`);
      return;
    }
    
    // Chercher le produit et la variante qui correspondent
    let foundProduct = null;
    let foundVariant = null;
    
    for (const product of products) {
      const productName = normalizeForComparison(product.name);
      
      // Vérifier si le nom correspond (exact ou partiel)
      if (productName === normalizedName || productName.includes(normalizedName) || normalizedName.includes(productName)) {
        // Chercher la variante dans ce produit
        for (const candidateVariant of product.variants || []) {
          const candidateVariantName = normalizeForComparison(candidateVariant.name);
          
          // Comparaison exacte
          if (candidateVariantName === normalizedVariant) {
            foundProduct = product;
            foundVariant = candidateVariant.name;
            break;
          }
          
          // Comparaison avec les parties de la variante
          for (const part of variantParts) {
            if (candidateVariantName === part || candidateVariantName.includes(part) || part.includes(candidateVariantName)) {
              foundProduct = product;
              foundVariant = candidateVariant.name;
              break;
            }
          }
          
          if (foundVariant) break;
          
          // Comparaison inverse
          const candidateVariantParts = candidateVariantName.split(/\s*\/\s*/).map(p => p.trim()).filter(p => p);
          for (const part of variantParts) {
            for (const candidatePart of candidateVariantParts) {
              if (part === candidatePart || part.includes(candidatePart) || candidatePart.includes(part)) {
                foundProduct = product;
                foundVariant = candidateVariant.name;
                break;
              }
            }
            if (foundVariant) break;
          }
          
          if (foundVariant) break;
        }
        
        if (foundVariant) break;
      }
    }
    
    if (!foundProduct || !foundVariant) {
      // Pas d'erreur, juste un log silencieux
      console.log(`ℹ️ Produit trouvé mais variante "${variant}" non trouvée pour la commande ${rowId} - la commande passe quand même à delivered`);
      return;
    }
    
    // Décrémenter le stock (permet stocks négatifs)
    const normalizedFoundVariant = normalizeForComparison(foundVariant);
    const variantIndex = foundProduct.variants.findIndex(
      (v: any) => normalizeForComparison(v.name) === normalizedFoundVariant
    );
    
    if (variantIndex === -1) {
      // Pas d'erreur, juste un log silencieux
      console.log(`ℹ️ Variante "${foundVariant}" non trouvée dans le produit pour la commande ${rowId} - la commande passe quand même à delivered`);
      return;
    }
    
    const currentQuantity = Number(foundProduct.variants[variantIndex].quantity) || 0;
    const nextQuantity = currentQuantity - quantity;
    
    // Permettre les stocks négatifs
    foundProduct.variants[variantIndex].quantity = nextQuantity;
    await foundProduct.save();
    
    // Log silencieux de succès
    console.log(`✅ Stock décrémenté automatiquement pour la commande ${rowId}: ${foundProduct.name} / ${foundVariant} (${currentQuantity} -> ${nextQuantity})`);
    
  } catch (error) {
    // Pas d'erreur affichée à l'utilisateur, juste un log silencieux
    const message = error instanceof Error ? error.message : 'Erreur inconnue';
    console.log(`ℹ️ Erreur lors de la décrémentation automatique du stock pour la commande ${rowId}: ${message} - la commande passe quand même à delivered`);
    // Ne pas faire échouer la mise à jour du statut
  }
};

/**
 * Ré-incrémente automatiquement le stock pour une commande retournée
 * (annule la décrémentation faite lors du statut "delivered")
 * Ne lance pas d'erreur si le produit n'est pas trouvé
 */
export const incrementStockForReturnedOrder = async (
  row: Record<string, unknown>,
  rowId: string
): Promise<void> => {
  const productInfo = extractProductInfo(row);
  if (!productInfo) {
    console.log(
      `ℹ️ Impossible d'extraire les informations produit pour la commande ${rowId} lors du retour - aucune modification de stock`
    );
    return;
  }

  const { name, variant, quantity } = productInfo;

  if (!name || !variant || quantity <= 0) {
    console.log(
      `ℹ️ Informations produit incomplètes pour la commande ${rowId} lors du retour (nom: ${
        name || 'N/A'
      }, variante: ${variant || 'N/A'}) - aucune modification de stock`
    );
    return;
  }

  try {
    const Product = (await import('../products/product.model')).default;

    const normalizedName = normalizeForComparison(name);
    const normalizedVariant = normalizeForComparison(variant);
    const variantParts = normalizedVariant
      .split(/\s*\/\s*/)
      .map((p) => p.trim())
      .filter((p) => p);

    const products = await Product.find({
      name: {
        $regex: new RegExp(
          normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i'
        ),
      },
    });

    if (products.length === 0) {
      console.log(
        `ℹ️ Aucun produit trouvé avec le nom "${name}" pour la commande ${rowId} lors du retour - aucune modification de stock`
      );
      return;
    }

    let foundProduct: any = null;
    let foundVariant: string | null = null;

    for (const product of products) {
      const productName = normalizeForComparison(product.name);

      if (
        productName === normalizedName ||
        productName.includes(normalizedName) ||
        normalizedName.includes(productName)
      ) {
        for (const candidateVariant of product.variants || []) {
          const candidateVariantName = normalizeForComparison(
            candidateVariant.name
          );

          if (candidateVariantName === normalizedVariant) {
            foundProduct = product;
            foundVariant = candidateVariant.name;
            break;
          }

          for (const part of variantParts) {
            if (
              candidateVariantName === part ||
              candidateVariantName.includes(part) ||
              part.includes(candidateVariantName)
            ) {
              foundProduct = product;
              foundVariant = candidateVariant.name;
              break;
            }
          }

          if (foundVariant) break;

          const candidateVariantParts = candidateVariantName
            .split(/\s*\/\s*/)
            .map((p) => p.trim())
            .filter((p) => p);
          for (const part of variantParts) {
            for (const candidatePart of candidateVariantParts) {
              if (
                part === candidatePart ||
                part.includes(candidatePart) ||
                candidatePart.includes(part)
              ) {
                foundProduct = product;
                foundVariant = candidateVariant.name;
                break;
              }
            }
            if (foundVariant) break;
          }

          if (foundVariant) break;
        }

        if (foundVariant) break;
      }
    }

    if (!foundProduct || !foundVariant) {
      console.log(
        `ℹ️ Produit trouvé mais variante "${variant}" non trouvée pour la commande ${rowId} lors du retour - aucune modification de stock`
      );
      return;
    }

    const normalizedFoundVariant = normalizeForComparison(foundVariant);
    const variantIndex = foundProduct.variants.findIndex(
      (v: any) => normalizeForComparison(v.name) === normalizedFoundVariant
    );

    if (variantIndex === -1) {
      console.log(
        `ℹ️ Variante "${foundVariant}" non trouvée dans le produit pour la commande ${rowId} lors du retour - aucune modification de stock`
      );
      return;
    }

    const currentQuantity =
      Number(foundProduct.variants[variantIndex].quantity) || 0;
    const nextQuantity = currentQuantity + quantity;

    foundProduct.variants[variantIndex].quantity = nextQuantity;
    await foundProduct.save();

    console.log(
      `✅ Stock ré-incrémenté automatiquement pour la commande ${rowId}: ${foundProduct.name} / ${foundVariant} (${currentQuantity} -> ${nextQuantity})`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erreur inconnue';
    console.log(
      `ℹ️ Erreur lors de la ré-incrémentation automatique du stock pour la commande ${rowId}: ${message} - aucune erreur renvoyée à l'utilisateur`
    );
  }
};

