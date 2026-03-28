"""
╔══════════════════════════════════════════════════════════╗
║      MOTOKEY — GÉNÉRATEUR DE FACTURES PDF               ║
║      Utilise : reportlab (pip install reportlab)        ║
╚══════════════════════════════════════════════════════════╝

USAGE :
    python3 pdf_generator.py                → génère une facture de demo
    from pdf_generator import generer_facture
    pdf_bytes = generer_facture(devis_data)

INTÉGRATION API :
    Appelé par le endpoint POST /devis/:id/pdf
    Le PDF est ensuite uploadé sur Supabase Storage
"""

import io
import os
from datetime import datetime
from reportlab.lib              import colors
from reportlab.lib.pagesizes    import A4
from reportlab.lib.units        import mm
from reportlab.lib.styles       import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums        import TA_LEFT, TA_RIGHT, TA_CENTER
from reportlab.platypus         import (SimpleDocTemplate, Paragraph, Spacer,
                                        Table, TableStyle, HRFlowable,
                                        KeepTogether)
from reportlab.pdfgen           import canvas as rl_canvas


# ── Palette MotoKey ──────────────────────────────────────
C_NOIR     = colors.HexColor('#0d0f12')
C_ACCENT   = colors.HexColor('#ff6b00')
C_GRIS1    = colors.HexColor('#1c1f23')
C_GRIS2    = colors.HexColor('#2a2d32')
C_GRIS3    = colors.HexColor('#8b9199')
C_BLANC    = colors.white
C_FOND     = colors.HexColor('#f4f1ec')
C_VERT     = colors.HexColor('#22c55e')
C_ROUGE    = colors.HexColor('#ef4444')

COULEUR_BADGE = {
    'vert':  colors.HexColor('#22c55e'),
    'bleu':  colors.HexColor('#3b82f6'),
    'jaune': colors.HexColor('#eab308'),
    'rouge': colors.HexColor('#ef4444'),
}


# ══════════════════════════════════════════════════════════
# CANVAS PERSONNALISÉ (header/footer sur chaque page)
# ══════════════════════════════════════════════════════════
class MotoKeyCanvas(rl_canvas.Canvas):

    def __init__(self, *args, garage=None, devis=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._garage = garage or {}
        self._devis  = devis  or {}
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        nb_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self._draw_header()
            self._draw_footer(nb_pages)
            super().showPage()
        super().save()

    def _draw_header(self):
        w, h = A4
        # Bande noire en haut
        self.setFillColor(C_NOIR)
        self.rect(0, h - 28*mm, w, 28*mm, fill=1, stroke=0)
        # Logo MOTOKEY
        self.setFillColor(C_BLANC)
        self.setFont('Helvetica-Bold', 20)
        self.drawString(15*mm, h - 18*mm, 'MOTO')
        self.setFillColor(C_ACCENT)
        self.drawString(15*mm + self.stringWidth('MOTO','Helvetica-Bold',20), h - 18*mm, 'KEY')
        # Titre FACTURE / DEVIS
        self.setFillColor(C_BLANC)
        self.setFont('Helvetica-Bold', 11)
        doc_type = 'DEVIS' if self._devis.get('statut') != 'valide' else 'FACTURE'
        self.drawRightString(w - 15*mm, h - 14*mm, doc_type)
        self.setFont('Helvetica', 9)
        self.setFillColor(C_GRIS3)
        self.drawRightString(w - 15*mm, h - 19*mm, f"N° {self._devis.get('numero','—')}")
        # Ligne orange sous le header
        self.setStrokeColor(C_ACCENT)
        self.setLineWidth(2)
        self.line(0, h - 29*mm, w, h - 29*mm)

    def _draw_footer(self, nb_pages):
        w, _ = A4
        # Ligne
        self.setStrokeColor(C_GRIS2)
        self.setLineWidth(0.5)
        self.line(15*mm, 18*mm, w - 15*mm, 18*mm)
        # Texte footer gauche
        self.setFont('Helvetica', 7)
        self.setFillColor(C_GRIS3)
        nom    = self._garage.get('nom', 'MotoKey Garage')
        siret  = self._garage.get('siret', '')
        adresse= self._garage.get('adresse', '')
        self.drawString(15*mm, 13*mm, f"{nom}  |  SIRET : {siret}")
        self.drawString(15*mm, 9*mm,  adresse)
        # Page X/Y droite
        self.setFont('Helvetica-Bold', 8)
        self.setFillColor(C_ACCENT)
        self.drawRightString(w - 15*mm, 11*mm,
                             f"Page {self._pageNumber} / {nb_pages}")
        # MotoKey watermark
        self.setFont('Helvetica', 7)
        self.setFillColor(C_GRIS2)
        self.drawCentredString(w/2, 6*mm, "Dossier numérique sécurisé · motokey.fr")


# ══════════════════════════════════════════════════════════
# STYLES
# ══════════════════════════════════════════════════════════
def get_styles():
    base = getSampleStyleSheet()
    return {
        'titre_section': ParagraphStyle('titre_section',
            fontName='Helvetica-Bold', fontSize=9,
            textColor=C_GRIS3, spaceAfter=4,
            spaceBefore=8, leading=12,
            letterSpacing=2),
        'valeur': ParagraphStyle('valeur',
            fontName='Helvetica-Bold', fontSize=11,
            textColor=C_NOIR, leading=14),
        'valeur_sm': ParagraphStyle('valeur_sm',
            fontName='Helvetica', fontSize=10,
            textColor=C_NOIR, leading=13),
        'note': ParagraphStyle('note',
            fontName='Helvetica-Oblique', fontSize=8,
            textColor=C_GRIS3, leading=11),
        'col_head': ParagraphStyle('col_head',
            fontName='Helvetica-Bold', fontSize=8,
            textColor=C_BLANC, alignment=TA_LEFT),
        'col_head_r': ParagraphStyle('col_head_r',
            fontName='Helvetica-Bold', fontSize=8,
            textColor=C_BLANC, alignment=TA_RIGHT),
        'ligne_desc': ParagraphStyle('ligne_desc',
            fontName='Helvetica-Bold', fontSize=9,
            textColor=C_NOIR, leading=12),
        'ligne_ref': ParagraphStyle('ligne_ref',
            fontName='Helvetica', fontSize=8,
            textColor=C_GRIS3, leading=10),
        'remise_note': ParagraphStyle('remise_note',
            fontName='Helvetica-Oblique', fontSize=8,
            textColor=C_VERT, leading=10),
        'litige_note': ParagraphStyle('litige_note',
            fontName='Helvetica-Oblique', fontSize=8,
            textColor=C_ROUGE, leading=10),
        'total_label': ParagraphStyle('total_label',
            fontName='Helvetica', fontSize=10,
            textColor=C_GRIS3, alignment=TA_RIGHT),
        'total_val': ParagraphStyle('total_val',
            fontName='Helvetica-Bold', fontSize=10,
            textColor=C_NOIR, alignment=TA_RIGHT),
        'total_ttc_label': ParagraphStyle('total_ttc_label',
            fontName='Helvetica-Bold', fontSize=13,
            textColor=C_BLANC, alignment=TA_RIGHT),
        'total_ttc_val': ParagraphStyle('total_ttc_val',
            fontName='Helvetica-Bold', fontSize=16,
            textColor=C_BLANC, alignment=TA_RIGHT),
        'score_label': ParagraphStyle('score_label',
            fontName='Helvetica-Bold', fontSize=8,
            textColor=C_GRIS3, leading=10),
        'legal': ParagraphStyle('legal',
            fontName='Helvetica', fontSize=7.5,
            textColor=C_GRIS3, leading=11),
    }


# ══════════════════════════════════════════════════════════
# FONCTIONS UTILITAIRES
# ══════════════════════════════════════════════════════════
def fmt_eur(val):
    try:
        return f"{float(val):,.2f} €".replace(',', ' ')
    except:
        return "0,00 €"

def fmt_date(d):
    if not d:
        return datetime.now().strftime('%d/%m/%Y')
    try:
        if isinstance(d, str) and 'T' in d:
            return d[:10].replace('-', '/')[::-1].replace('/', '-')[::-1]
        return str(d)
    except:
        return str(d)


# ══════════════════════════════════════════════════════════
# FONCTION PRINCIPALE
# ══════════════════════════════════════════════════════════
def generer_facture(data: dict) -> bytes:
    """
    Génère un PDF facture MotoKey et retourne les bytes.

    data = {
        'garage': { nom, adresse, tel, email, siret, taux_std, taux_spec, tva },
        'client': { nom, email, tel, adresse },
        'moto':   { marque, modele, annee, plaque, vin, km, score, couleur_dossier },
        'devis':  {
            id, numero, statut, technicien,
            remise_type, remise_pct, remise_note, tva,
            created_at, valide_at,
            lignes: [{ type, icon, desc, ref, qty, pu, remise_pct, remise_type, remise_note, total_ht }],
            totaux: { mo_ht, pieces_ht, remise_lignes, sous_total, remise_globale, base_ht, tva_montant, total_ttc }
        }
    }
    """
    buffer  = io.BytesIO()
    garage  = data.get('garage', {})
    client  = data.get('client', {})
    moto    = data.get('moto',   {})
    devis   = data.get('devis',  {})
    totaux  = devis.get('totaux', {})
    lignes  = devis.get('lignes', [])
    styles  = get_styles()

    # Marges
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=35*mm, bottomMargin=25*mm,
        title=f"Facture MotoKey {devis.get('numero','')}",
        author=garage.get('nom', 'MotoKey'),
        creator='MotoKey v1.0'
    )

    story = []
    w = A4[0] - 30*mm  # largeur utile

    # ── SECTION 1 : Infos garage + client + moto ──────────
    def info_block(label, *lignes_txt):
        elems = [Paragraph(label.upper(), styles['titre_section'])]
        for l in lignes_txt:
            if l:
                elems.append(Paragraph(str(l), styles['valeur_sm']))
        return elems

    # Tableau 3 colonnes
    col_w = w / 3
    info_table = Table([
        [
            info_block('Garage émetteur',
                       garage.get('nom',''),
                       garage.get('adresse',''),
                       f"Tél : {garage.get('tel','')}",
                       f"Email : {garage.get('email','')}",
                       f"SIRET : {garage.get('siret','')}"),
            info_block('Client',
                       client.get('nom',''),
                       client.get('email',''),
                       client.get('tel',''),
                       client.get('adresse','')),
            info_block('Véhicule',
                       f"{moto.get('marque','')} {moto.get('modele','')} {moto.get('annee','')}",
                       f"Plaque : {moto.get('plaque','')}",
                       f"VIN : {moto.get('vin','')}",
                       f"Kilométrage : {moto.get('km',0):,} km".replace(',', ' '),
                       f"Technicien : {devis.get('technicien','')}"),
        ]
    ], colWidths=[col_w, col_w, col_w])
    info_table.setStyle(TableStyle([
        ('VALIGN',      (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING',(0,0), (-1,-1), 6),
        ('TOPPADDING',  (0,0), (-1,-1), 0),
        ('BOTTOMPADDING',(0,0),(-1,-1), 0),
        ('LINEAFTER',   (0,0), (1,0), 0.5, C_GRIS2),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 4*mm))

    # Date et références
    date_doc  = fmt_date(devis.get('valide_at') or devis.get('created_at'))
    date_ech  = "30 jours"
    doc_type  = 'Facture' if devis.get('statut') == 'valide' else 'Devis'
    refs_data = [
        [
            Paragraph(f"<b>{doc_type} N°</b>", styles['note']),
            Paragraph(f"<b>Date</b>", styles['note']),
            Paragraph(f"<b>Échéance</b>", styles['note']),
            Paragraph(f"<b>Score MotoKey</b>", styles['note']),
        ],
        [
            Paragraph(devis.get('numero','—'), styles['valeur']),
            Paragraph(date_doc, styles['valeur']),
            Paragraph(date_ech, styles['valeur']),
            _score_cell(moto.get('score', 0), moto.get('couleur_dossier','rouge')),
        ]
    ]
    refs_table = Table(refs_data, colWidths=[w*0.28, w*0.20, w*0.20, w*0.32])
    refs_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), C_FOND),
        ('BACKGROUND', (0,1), (-1,1), colors.white),
        ('BOX',        (0,0), (-1,-1), 0.5, C_GRIS2),
        ('INNERGRID',  (0,0), (-1,-1), 0.5, C_GRIS2),
        ('VALIGN',     (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING',(0,0),(-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING',(0,0), (-1,-1), 5),
    ]))
    story.append(refs_table)
    story.append(Spacer(1, 5*mm))

    # ── SECTION 2 : Tableau des lignes ────────────────────
    # En-tête colonnes
    COLS = ['Type', 'Description / Référence', 'Qté', 'PU HT', 'Rem.', 'Total HT']
    col_widths = [12*mm, w - 12*mm - 20*mm - 22*mm - 16*mm - 22*mm, 20*mm, 22*mm, 16*mm, 22*mm]

    head_row = [Paragraph(c, styles['col_head'] if i < 2 else styles['col_head_r'])
                for i, c in enumerate(COLS)]
    table_data = [head_row]

    for l in lignes:
        rem_pct  = float(l.get('remise_pct', 0) or 0)
        pu       = float(l.get('pu') or l.get('prix_unitaire', 0) or 0)
        qty      = float(l.get('qty') or l.get('quantite', 1) or 1)
        total    = float(l.get('total_ht', 0) or pu * qty * (1 - rem_pct/100))
        icon     = l.get('icon', '🔧')
        typ      = l.get('type', '')
        ref      = l.get('ref') or l.get('reference', '')
        desc     = l.get('desc') or l.get('description', '')
        r_type   = l.get('remise_type') or l.get('reason_type', '')
        r_note   = l.get('remise_note') or l.get('note', '')

        desc_para = Paragraph(f"<b>{desc}</b>", styles['ligne_desc'])
        ref_para  = Paragraph(ref, styles['ligne_ref']) if ref else Spacer(1,1)

        # Note de remise ou litige
        extra = None
        if rem_pct > 0 and r_note:
            st = styles['remise_note'] if r_type != 'litige' else styles['litige_note']
            prefix = '💚' if r_type != 'litige' else '⚠'
            extra = Paragraph(f"{prefix} {r_note}", st)

        desc_cell = [desc_para, ref_para] + ([extra] if extra else [])

        # Couleur de ligne selon remise/litige
        row = [
            Paragraph(icon, styles['valeur_sm']),
            desc_cell,
            Paragraph(f"{qty:g} {'h' if typ=='mo' else 'u'}", ParagraphStyle('r', fontName='Helvetica', fontSize=9, alignment=TA_RIGHT)),
            Paragraph(fmt_eur(pu), ParagraphStyle('r', fontName='Helvetica', fontSize=9, alignment=TA_RIGHT)),
            Paragraph(f"{rem_pct:g}%" if rem_pct > 0 else "—",
                      ParagraphStyle('r', fontName='Helvetica', fontSize=9,
                                     textColor=C_VERT if r_type != 'litige' else C_ROUGE,
                                     alignment=TA_RIGHT)),
            Paragraph(fmt_eur(total), ParagraphStyle('r', fontName='Helvetica-Bold', fontSize=9, alignment=TA_RIGHT)),
        ]
        table_data.append(row)

    lignes_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    # Construire les styles
    ts = [
        # Header
        ('BACKGROUND', (0,0), (-1,0), C_NOIR),
        ('TEXTCOLOR',  (0,0), (-1,0), C_BLANC),
        ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',   (0,0), (-1,0), 8),
        ('TOPPADDING', (0,0), (-1,0), 5),
        ('BOTTOMPADDING',(0,0),(-1,0), 5),
        # Lignes
        ('FONTNAME',   (0,1), (-1,-1), 'Helvetica'),
        ('FONTSIZE',   (0,1), (-1,-1), 9),
        ('VALIGN',     (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,1), (-1,-1), 5),
        ('BOTTOMPADDING',(0,1),(-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING',(0,0), (-1,-1), 5),
        ('GRID',       (0,0), (-1,-1), 0.3, C_GRIS2),
        # Alternance
        *[('BACKGROUND', (0, i), (-1, i), C_FOND if i % 2 == 0 else colors.white)
          for i in range(1, len(table_data))],
        # Remises vertes / litiges rouges
        *[('BACKGROUND', (0,i), (-1,i), colors.HexColor('#f0fdf4'))
          for i, l in enumerate(lignes, 1)
          if float(l.get('remise_pct',0) or 0) > 0
          and (l.get('remise_type') or l.get('reason_type','')) != 'litige'],
        *[('BACKGROUND', (0,i), (-1,i), colors.HexColor('#fef2f2'))
          for i, l in enumerate(lignes, 1)
          if (l.get('remise_type') or l.get('reason_type','')) == 'litige'],
    ]
    lignes_table.setStyle(TableStyle(ts))
    story.append(KeepTogether([lignes_table]))
    story.append(Spacer(1, 4*mm))

    # ── SECTION 3 : Totaux ────────────────────────────────
    mo_ht    = float(totaux.get('mo_ht',  0))
    pie_ht   = float(totaux.get('pieces_ht', 0))
    rem_l    = float(totaux.get('remise_lignes', 0))
    sous     = float(totaux.get('sous_total', mo_ht + pie_ht - rem_l))
    rem_g    = float(totaux.get('remise_globale', 0))
    base     = float(totaux.get('base_ht', sous - rem_g))
    tva_m    = float(totaux.get('tva_montant', base * 0.20))
    ttc      = float(totaux.get('total_ttc', base + tva_m))
    tva_pct  = int(devis.get('tva', 20))

    total_rows = []
    def add_total_row(label, val, bold=False, color_val=None):
        lp = ParagraphStyle('tl', fontName='Helvetica-Bold' if bold else 'Helvetica',
                             fontSize=10 if bold else 9,
                             textColor=C_NOIR if bold else C_GRIS3, alignment=TA_RIGHT)
        vp = ParagraphStyle('tv', fontName='Helvetica-Bold', fontSize=10 if bold else 9,
                             textColor=color_val or (C_NOIR if bold else C_GRIS3), alignment=TA_RIGHT)
        total_rows.append([Paragraph(label, lp), Paragraph(fmt_eur(val), vp)])

    add_total_row('Main d\'oeuvre HT', mo_ht)
    add_total_row('Pièces & fournitures HT', pie_ht)
    if rem_l > 0:
        add_total_row('Remises sur lignes', -rem_l, color_val=C_VERT)
    add_total_row('Sous-total HT', sous, bold=True)
    if rem_g > 0:
        lbl_type = {
            'fidelite': '★ Fidélité',
            'geste':    '🎁 Geste commercial',
            'litige':   '⚠ Litige',
        }.get(devis.get('remise_type',''), 'Remise')
        pct = devis.get('remise_pct', 0)
        add_total_row(f"{lbl_type} ({pct}%)", -rem_g, color_val=C_VERT)
    add_total_row(f'Base HT après remises', base)
    add_total_row(f'TVA {tva_pct}%', tva_m)

    # Ligne TTC (fond noir)
    total_rows.append([
        Paragraph('TOTAL TTC', ParagraphStyle('ttcl', fontName='Helvetica-Bold',
                                               fontSize=13, textColor=C_BLANC, alignment=TA_RIGHT)),
        Paragraph(fmt_eur(ttc), ParagraphStyle('ttcv', fontName='Helvetica-Bold',
                                               fontSize=16, textColor=C_ACCENT, alignment=TA_RIGHT)),
    ])

    # Geste commercial note
    note_geste = devis.get('remise_note','')
    if note_geste and rem_g > 0:
        total_rows.append([
            Paragraph(f"Note : {note_geste}", ParagraphStyle('ng',
                fontName='Helvetica-Oblique', fontSize=8,
                textColor=C_VERT, alignment=TA_RIGHT, colSpan=2)),
            ''
        ])

    tw   = w * 0.45
    t_col= [tw * 0.60, tw * 0.40]
    tot_table = Table(total_rows, colWidths=t_col)
    ts2 = [
        ('ALIGN',  (0,0), (-1,-1), 'RIGHT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING',    (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING',   (0,0), (-1,-1), 4),
        ('RIGHTPADDING',  (0,0), (-1,-1), 4),
        # Ligne TTC
        ('BACKGROUND', (0, -1+(1 if note_geste and rem_g>0 else 0)), (-1, -1+(1 if note_geste and rem_g>0 else 0)), C_NOIR),
        ('TOPPADDING', (0, -1+(1 if note_geste and rem_g>0 else 0)), (-1, -1+(1 if note_geste and rem_g>0 else 0)), 8),
        ('BOTTOMPADDING', (0, -1+(1 if note_geste and rem_g>0 else 0)), (-1, -1+(1 if note_geste and rem_g>0 else 0)), 8),
        ('LINEABOVE', (0, len(total_rows)-1-(1 if note_geste and rem_g>0 else 0)),
                      (-1, len(total_rows)-1-(1 if note_geste and rem_g>0 else 0)), 1, C_ACCENT),
    ]
    tot_table.setStyle(TableStyle(ts2))

    # Infos paiement + totaux côte à côte
    paiement_txt = "\n".join([
        "<b>MODALITÉS DE PAIEMENT</b>",
        "Règlement à réception de facture.",
        "Virement / CB / Chèque",
        f"RIB : IBAN FR76 XXXX XXXX XXXX",
        "",
        f"<b>TVA non récupérable</b> si particulier.",
        "Pas d'escompte pour paiement anticipé.",
    ])
    pay_para = Paragraph(paiement_txt.replace('\n','<br/>'),
                         ParagraphStyle('pay', fontName='Helvetica', fontSize=8,
                                        textColor=C_GRIS3, leading=12))

    bottom_table = Table([[pay_para, tot_table]],
                         colWidths=[w - tw - 5*mm, tw])
    bottom_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('LEFTPADDING',  (0,0), (0,0), 0),
        ('RIGHTPADDING', (1,0), (1,0), 0),
    ]))
    story.append(bottom_table)
    story.append(Spacer(1, 6*mm))

    # ── SECTION 4 : Score MotoKey + Certification ─────────
    couleur_val = moto.get('couleur_dossier', 'rouge')
    score_val   = moto.get('score', 0)
    col_badge   = COULEUR_BADGE.get(couleur_val, C_ROUGE)
    label_badge = {
        'vert':  'EXCELLENT — Entretien 100% tracé concession',
        'bleu':  'BON — Validé par professionnel certifié',
        'jaune': 'MOYEN — Entretien partiel / propriétaire',
        'rouge': 'INSUFFISANT — Entretien non justifié',
    }.get(couleur_val, '')

    score_data = [[
        Paragraph(f"<b>DOSSIER MOTOKEY</b>", ParagraphStyle('sl',
            fontName='Helvetica-Bold', fontSize=9, textColor=C_GRIS3)),
        Paragraph(f"<b>Score : {score_val}/100</b>", ParagraphStyle('sv',
            fontName='Helvetica-Bold', fontSize=11, textColor=col_badge)),
        Paragraph(label_badge, ParagraphStyle('sb',
            fontName='Helvetica', fontSize=9, textColor=col_badge)),
        Paragraph("🛡️  Facture certifiée MotoKey · SHA-256",
                  ParagraphStyle('cert', fontName='Helvetica', fontSize=8, textColor=C_GRIS3)),
    ]]
    score_table = Table(score_data, colWidths=[w*0.22, w*0.22, w*0.34, w*0.22])
    score_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), C_FOND),
        ('BOX',        (0,0), (-1,-1), 1, col_badge),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('RIGHTPADDING',(0,0), (-1,-1), 6),
        ('TOPPADDING',  (0,0), (-1,-1), 6),
        ('BOTTOMPADDING',(0,0),(-1,-1), 6),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('LINEAFTER',   (0,0), (2,0), 0.5, C_GRIS2),
    ]))
    story.append(score_table)
    story.append(Spacer(1, 4*mm))

    # ── SECTION 5 : Mentions légales ──────────────────────
    mentions = (
        "Conformément à l'article L.441-6 du Code de commerce, en cas de retard de paiement, des pénalités de retard "
        "au taux de 3 fois le taux d'intérêt légal seront exigibles, ainsi qu'une indemnité forfaitaire pour frais de "
        "recouvrement de 40€. TVA non applicable si micro-entreprise (art. 293B CGI). Garantie légale de conformité "
        "applicable. Juridiction compétente : Tribunal de Commerce de Clermont-Ferrand."
    )
    story.append(Paragraph(mentions, styles['legal']))

    # ── BUILD ──────────────────────────────────────────────
    def make_canvas(*args, **kwargs):
        return MotoKeyCanvas(*args, garage=garage, devis=devis, **kwargs)

    doc.build(story, canvasmaker=make_canvas)
    return buffer.getvalue()


def _score_cell(score, couleur):
    """Cellule score colorée."""
    col = COULEUR_BADGE.get(couleur, C_ROUGE)
    lbl = {'vert':'✅ EXCELLENT','bleu':'🔵 BON','jaune':'🟡 MOYEN','rouge':'🔴 INSUFFISANT'}.get(couleur,'')
    return [
        Paragraph(f"<b>{score}/100</b>", ParagraphStyle('sc',
            fontName='Helvetica-Bold', fontSize=13, textColor=col)),
        Paragraph(lbl, ParagraphStyle('sl',
            fontName='Helvetica', fontSize=8, textColor=col)),
    ]


# ══════════════════════════════════════════════════════════
# DEMO — génère une facture de test
# ══════════════════════════════════════════════════════════
DEMO_DATA = {
    'garage': {
        'nom':     'Garage MotoKey Clermont-Ferrand',
        'adresse': '12 rue des Mécaniciens, 63000 Clermont-Ferrand',
        'tel':     '04 73 00 00 01',
        'email':   'garage@motokey.fr',
        'siret':   '123 456 789 01234',
        'taux_std':  65,
        'taux_spec': 80,
        'tva':       20,
    },
    'client': {
        'nom':    'Sophie Laurent',
        'email':  'sophie@email.com',
        'tel':    '06 10 00 00 01',
        'adresse':'15 avenue des Volcans, 63000 Clermont-Ferrand',
    },
    'moto': {
        'marque':          'Yamaha',
        'modele':          'MT-07',
        'annee':           2021,
        'plaque':          'EF-789-GH',
        'vin':             'JYARN22E00A000002',
        'km':              18650,
        'score':           74,
        'couleur_dossier': 'bleu',
    },
    'devis': {
        'id':           'dv-001',
        'numero':       '2026-0147',
        'statut':       'valide',
        'technicien':   'Jean-Marc Duval',
        'remise_type':  'fidelite',
        'remise_pct':   10,
        'remise_note':  'Client fidèle depuis 4 ans',
        'tva':          20,
        'created_at':   '2026-03-27',
        'valide_at':    '2026-03-27',
        'lignes': [
            {
                'type':'mo',    'icon':'🔧', 'desc':'Vidange + filtre à huile',
                'ref':'MO-STD', 'qty':0.8,  'pu':65.00,
                'remise_pct':0, 'remise_type':'', 'remise_note':'', 'total_ht':52.00,
            },
            {
                'type':'fluide','icon':'🛢️', 'desc':'Huile Yamalube 10W-40 · 3 litres',
                'ref':'FLU-YAM','qty':3,     'pu':12.50,
                'remise_pct':0, 'remise_type':'', 'remise_note':'', 'total_ht':37.50,
            },
            {
                'type':'piece', 'icon':'🔩', 'desc':'Filtre à huile Yamaha OEM',
                'ref':'PIE-001','qty':1,     'pu':14.90,
                'remise_pct':0, 'remise_type':'', 'remise_note':'', 'total_ht':14.90,
            },
            {
                'type':'mo',    'icon':'🔧', 'desc':'Contrôle chaîne + graissage',
                'ref':'MO-STD', 'qty':0.3,  'pu':65.00,
                'remise_pct':0, 'remise_type':'', 'remise_note':'', 'total_ht':19.50,
            },
            {
                'type':'piece', 'icon':'🔩', 'desc':'Graisse chaîne Motul C2 · 400ml',
                'ref':'PIE-002','qty':1,     'pu':9.90,
                'remise_pct':15,'remise_type':'fidelite','remise_note':'Geste fidélité', 'total_ht':8.42,
            },
        ],
        'totaux': {
            'mo_ht':         71.50,
            'pieces_ht':     61.80,
            'remise_lignes':  1.48,
            'sous_total':    131.82,
            'remise_globale': 13.18,
            'base_ht':       118.64,
            'tva_montant':    23.73,
            'total_ttc':     142.37,
        },
    },
}

if __name__ == '__main__':
    print("Génération de la facture de démonstration...")
    pdf_bytes = generer_facture(DEMO_DATA)
    output_path = '/mnt/user-data/outputs/facture_demo_motokey.pdf'
    with open(output_path, 'wb') as f:
        f.write(pdf_bytes)
    print(f"✅ PDF généré : {output_path}")
    print(f"   Taille : {len(pdf_bytes):,} octets ({len(pdf_bytes)//1024} Ko)")
