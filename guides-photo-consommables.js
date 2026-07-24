/* ═══════════════════════════════════════════════════════
   GUIDES PHOTO SVG — croquis illustré + zone de cadrage (L11 morceau 3/3)
   Module PARTAGÉ servi à l'espace client (/client) et à l'atelier (/atelier)
   sur /guides-photo-consommables.js — voir motokey-api.js.
   Doctrine L11 : guides identiques client/mécano, sinon divergence et
   photos non comparables. NE PAS DUPLIQUER dans MotoKey_Client.html ou
   MotoKey_Atelier.html — étendre ici uniquement (L14).
═══════════════════════════════════════════════════════ */
const GUIDES = {
  pneu: {
    svg: `<svg width="110" height="110" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="44" fill="#f4f4f4" stroke="#222" stroke-width="2.5"/>
      <circle cx="60" cy="60" r="16" fill="#ddd" stroke="#222" stroke-width="2"/>
      <path d="M20,60 A40,40 0 0,1 60,20" stroke="#e11" stroke-width="4" fill="none"/>
      <text x="60" y="14" font-size="9" fill="#e11" text-anchor="middle" font-weight="600">bande</text>
    </svg>
    <svg width="110" height="110" viewBox="0 0 120 120">
      <ellipse cx="60" cy="60" rx="48" ry="30" fill="#f4f4f4" stroke="#222" stroke-width="2.5"/>
      <rect x="25" y="50" width="70" height="20" fill="none" stroke="#e11" stroke-width="2.5" stroke-dasharray="5,3" rx="3"/>
      <text x="60" y="80" font-size="8" fill="#e11" text-anchor="middle" font-weight="600">flanc</text>
    </svg>`,
    titre: 'Photo du pneu',
    sousTitre: 'Cadrez la bande de roulement (zone rouge) — le flanc peut apparaître en second plan. Pneu sec, propre, bonne luminosité.'
  },
  chaine_brin: {
    svg: `<svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="35" cy="60" r="18" fill="#f4f4f4" stroke="#222" stroke-width="3"/>
      <circle cx="90" cy="60" r="10" fill="#f4f4f4" stroke="#222" stroke-width="3"/>
      <path d="M50,50 L78,54 M50,70 L78,66" stroke="#222" stroke-width="2.5"/>
      <rect x="45" y="45" width="35" height="30" fill="none" stroke="#e11" stroke-width="2.5" stroke-dasharray="5,3" rx="3"/>
    </svg>`,
    titre: 'Photo 1/2 — Le brin de chaîne',
    sousTitre: 'Cadrez une portion tendue de la chaîne (zone rouge), chaîne sèche et propre, sans produit dessus.'
  },
  chaine_couronne: {
    svg: `<svg width="120" height="120" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="30" fill="#f4f4f4" stroke="#222" stroke-width="3"/>
      <circle cx="60" cy="60" r="6" fill="#222"/>
      <g stroke="#222" stroke-width="2.5">
        <line x1="60" y1="30" x2="60" y2="38"/><line x1="85" y1="45" x2="79" y2="49"/>
        <line x1="85" y1="75" x2="79" y2="71"/><line x1="60" y1="90" x2="60" y2="82"/>
        <line x1="35" y1="75" x2="41" y2="71"/><line x1="35" y1="45" x2="41" y2="49"/>
      </g>
      <circle cx="60" cy="60" r="30" fill="none" stroke="#e11" stroke-width="2.5" stroke-dasharray="5,3"/>
    </svg>`,
    titre: 'Photo 2/2 — La couronne',
    sousTitre: "Cadrez la couronne arrière en entier (zone rouge). C'est cette photo qui détermine surtout l'état affiché."
  },
  courroie: {
    svg: `<svg width="140" height="120" viewBox="0 0 140 120">
      <circle cx="40" cy="60" r="22" fill="#f4f4f4" stroke="#222" stroke-width="2.5"/>
      <circle cx="100" cy="60" r="14" fill="#f4f4f4" stroke="#222" stroke-width="2.5"/>
      <path d="M40,38 L100,46 M40,82 L100,74" stroke="#222" stroke-width="3" fill="none"/>
      <rect x="30" y="35" width="80" height="50" fill="none" stroke="#e11" stroke-width="2.5" stroke-dasharray="5,3" rx="4"/>
    </svg>`,
    titre: 'Photo de la courroie',
    sousTitre: 'Cadrez la portion de courroie visible (zone rouge). Pas de graisse à vérifier sur ce type de transmission — une seule photo suffit.'
  }
};

// Doctrine L11 point 4 : seuls ces 3 types relèvent d'un suivi photo+IA (méthode A).
// Les 6 autres (plaquettes/disques/huile/liquide_frein) relèvent d'un contrôle mécano
// manuel ou d'un suivi temps+km — pas de champ 'methode' en base pour piloter ça
// dynamiquement (vérifié : ni consommables, ni TYPES_CONSOMMABLES, ni la forme
// renvoyée par GET /motos/:id/consommables n'exposent cette donnée) — liste en dur
// assumée, à migrer vers un champ DB si une 4e méthode apparaît un jour.
const TYPES_METHODE_PHOTO = ['pneu_av', 'pneu_ar', 'chaine'];

/**
 * Résout la séquence de guides/zones à parcourir pour un type+profil donnés.
 * @returns {?Array<{zone: ?('brin'|'couronne'), guideKey: string}>} null = pas de photo pour ce cas
 */
function resolveGuideSequence(typeConsommable, profilTransmission) {
  if (typeConsommable === 'pneu_av' || typeConsommable === 'pneu_ar') {
    return [{ zone: null, guideKey: 'pneu' }];
  }
  if (typeConsommable === 'chaine') {
    if (profilTransmission === 'cardan') return null; // aucune photo — vidange de pont au km
    if (profilTransmission === 'courroie') return [{ zone: null, guideKey: 'courroie' }];
    return [{ zone: 'brin', guideKey: 'chaine_brin' }, { zone: 'couronne', guideKey: 'chaine_couronne' }];
  }
  return null; // hors méthode photo_ia — bouton jamais affiché pour ces types de toute façon
}
