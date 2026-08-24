// ==============================================================================
// RAPPORT DE PROJET DE FIN D'ÉTUDES - MASTER MIAGE
// Projet : LLM4SQL - Conception et développement d'une plateforme Text-to-SQL
// Auteur : Mohamed MBENGUE
// ==============================================================================

#set text(
  font: ("Segoe UI", "Arial"),
  lang: "fr",
  size: 11pt,
)

#set par(
  justify: true,
  leading: 1em,
  spacing: 1.4em,
)

// Configuration des marges académiques (reliure gauche 3.5cm, droite 2.5cm, haut/bas 2.5cm)
#set page(
  paper: "a4",
  margin: (top: 2.5cm, bottom: 2.5cm, left: 3.5cm, right: 2.5cm),
  header: context {
    let page_num = counter(page).get().first()
    if page_num > 1 {
      grid(
        columns: (1fr, auto),
        align: (left, right),
        text(size: 8.5pt, fill: rgb("#64748b"), emph[Master MIAGE — Université de Lille]),
        text(size: 8.5pt, fill: rgb("#64748b"), [LLM4SQL]),
      )
      v(2pt)
      line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
    }
  },
  footer: context {
    let page_num = counter(page).get().first()
    if page_num > 1 {
      line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
      v(2pt)
      grid(
        columns: (1fr, auto),
        align: (left, right),
        text(size: 8.5pt, fill: rgb("#94a3b8"), [Mémoire de Projet de Fin d'Études]),
        text(size: 9pt, weight: "bold", fill: rgb("#1e293b"), str(page_num)),
      )
    }
  },
)

// Numérotation et styles natifs des titres
#set heading(numbering: "1.1.1.")
#show heading.where(level: 1): set text(size: 18pt, fill: rgb("#1e3a8a"))
#show heading.where(level: 2): set text(size: 14pt, fill: rgb("#1e40af"))
#show heading.where(level: 3): set text(size: 12pt, fill: rgb("#334155"))

// ==============================================================================
// 1. PAGE DE GARDE OFFICIELLE
// ==============================================================================

#align(center)[
  #grid(
    columns: (3.2fr, 1fr),
    align: (left + horizon, right + horizon),
    image("Images/Logo Université+FST+département.png", width: 95%),
    image("Images/logo de la formation.png", width: 80%),
  )

  #v(1cm)

  #text(size: 13pt, weight: "bold", fill: rgb("#1e3a8a"))[
    MASTER MÉTHODES INFORMATIQUES APPLIQUÉES À LA GESTION DES ENTREPRISES (MIAGE)
  ] \
  #v(2pt)
  #text(size: 11pt, fill: rgb("#475569"), weight: "medium")[
    Parcours : Ingénierie des Projets Informatiques — Nouvelles Technologies
  ]

  #v(1.2cm)

  #text(size: 12pt, fill: rgb("#64748b"), tracking: 1.5pt)[MÉMOIRE DE PROJET DE FIN D'ÉTUDES]

  #v(0.8cm)

  #line(length: 95%, stroke: 1.5pt + rgb("#1e40af"))
  #v(0.3cm)
  #text(size: 24pt, weight: "bold", fill: rgb("#0f172a"))[LLM4SQL] \
  #v(0.3cm)
  #text(size: 14pt, fill: rgb("#334155"), weight: "medium")[
    Conception et développement d'une plateforme Text-to-SQL
  ]
  #v(0.3cm)
  #line(length: 95%, stroke: 1.5pt + rgb("#1e40af"))

  #v(2cm)

  #grid(
    columns: (1fr, 1fr),
    align: (left, right),
    [
      #text(weight: "bold", size: 10.5pt)[Présenté par :] \
      #text(size: 11pt, weight: "bold", fill: rgb("#0f172a"))[Mohamed MBENGUE] \
      #v(0.8cm)
      #text(weight: "bold", size: 10.5pt)[Année Universitaire :] \
      2025 – 2026
    ],
    [
      #text(weight: "bold", size: 10.5pt)[Sous la direction de :] \
      #text(size: 10.5pt, weight: "medium")[Mme Anne-Cécile CARON] \
      #text(size: 10.5pt, weight: "medium")[Mme Julie JACQUES] \
      #v(0.8cm)
      #text(weight: "bold", size: 10.5pt)[Cadre :] \
      Projet de Fin d'Études (M2)
    ],
  )
]

#pagebreak()

// ==============================================================================
// 2. REMERCIEMENTS & DÉCLARATION
// ==============================================================================

#heading(level: 1, numbering: none)[Remerciements]

Je tiens à exprimer ma profonde gratitude à mes encadrantes de projet, Mme Anne-Cécile CARON et Mme Julie JACQUES, pour leur accompagnement bienveillant, leurs orientations scientifiques et techniques précieuses, ainsi que leur grande disponibilité tout au long de ce travail de fin d'études.

Mes remerciements s'adressent également à l'ensemble de l'équipe pédagogique du Master MIAGE de l'Université de Lille (Faculté des Sciences et Technologies) pour la qualité des enseignements dispensés en ingénierie logicielle et en gouvernance des systèmes d'information.

Je remercie enfin chaleureusement mes proches pour leurs encouragements constants, ainsi que mes camarades de promotion pour la richesse de nos échanges et leur soutien tout au long de cette année universitaire.

#v(1.5cm)
#line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
#v(0.5cm)

#heading(level: 2, numbering: none)[Déclaration sur l'honneur]

Je soussigné, Mohamed MBENGUE, certifie sur l'honneur que ce mémoire de fin d'études constitue un travail personnel de conception et de développement. L'ensemble des bibliothèques logicielles, documentations techniques et publications académiques mobilisées sont rigoureusement référencées.

#pagebreak()

// ==============================================================================
// 3. RÉSUMÉS EXÉCUTIFS (FRANÇAIS & ANGLAIS)
// ==============================================================================

#include "chapters/00_abstracts.typ"

// ==============================================================================
// 4. TABLE DES MATIÈRES
// ==============================================================================

#outline(
  title: [Table des matières],
  indent: auto,
  depth: 3,
)

#pagebreak()

// ==============================================================================
// 5. CORPS DU RAPPORT
// ==============================================================================

#include "chapters/01_contexte_enjeux.typ"
#include "chapters/02_gestion_projet.typ"
#include "chapters/03_specifications.typ"
#include "chapters/04_architecture_conception.typ"
#include "chapters/05_implementation_defis.typ"
#include "chapters/06_evaluation_resultats.typ"
#include "chapters/07_bilan_perspectives.typ"

#pagebreak()

// ==============================================================================
// 6. RÉFÉRENCES BIBLIOGRAPHIQUES
// ==============================================================================

#bibliography("references.bib", style: "ieee", title: [Références Bibliographiques])

#pagebreak()

// ==============================================================================
// 7. ANNEXES TECHNIQUES
// ==============================================================================

#include "chapters/08_annexes.typ"

