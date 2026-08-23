import React, { useState, useEffect, useRef, useMemo } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { Table, Search, Link2, Key, HelpCircle, Maximize2, Minimize2, Sun, Moon } from 'lucide-react';
import { parseSqlSchema } from '../utils/sqlParser';

interface SchemaVisualizerProps {
  mermaidCode: string;
  schemaSql?: string;
  onGenerateDiagram?: () => Promise<void>;
  isVisualizing?: boolean;
}

/**
 * Gets a CSS class name based on the SQL data type of the column.
 * 
 * @param type - The string name of the SQL type.
 * @returns CSS class name for the badge.
 */
function getTypeBadgeClass(type: string): string {
  const t = type.toLowerCase();
  if (t.includes('int') || t.includes('num') || t.includes('decimal') || t.includes('double') || t.includes('real')) {
    return 'schema-visual-column-type-int';
  }
  if (t.includes('char') || t.includes('text') || t.includes('uuid')) {
    return 'schema-visual-column-type-text';
  }
  if (t.includes('date') || t.includes('time')) {
    return 'schema-visual-column-type-date';
  }
  return 'schema-visual-column-type-other';
}

/**
 * SchemaVisualizer Component that offers both a 100% robust interactive Card Explorer
 * and a fixed Mermaid ER Diagram renderer.
 * 
 * @param props - Component properties containing schema configurations
 */
export const SchemaVisualizer: React.FC<SchemaVisualizerProps> = React.memo(({ 
  mermaidCode, 
  schemaSql = "", 
  onGenerateDiagram, 
  isVisualizing = false 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'mermaid'>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [zoomScale, setZoomScale] = useState(1.0);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isRenderingMermaid, setIsRenderingMermaid] = useState(false);
  const [mermaidRenderError, setMermaidRenderError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [diagramTheme, setDiagramTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('llm4sql_diagram_theme') as 'light' | 'dark') || 'light';
  });

  const toggleDiagramTheme = () => {
    const next = diagramTheme === 'light' ? 'dark' : 'light';
    setDiagramTheme(next);
    localStorage.setItem('llm4sql_diagram_theme', next);
  };

  // Écoute de la touche Échap pour quitter le plein écran
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Agrandissement automatique pour un affichage optimal lors du passage en plein écran
  useEffect(() => {
    if (isFullscreen && zoomScale <= 1.0) {
      setZoomScale(1.35);
    }
  }, [isFullscreen]);

  // Parse tables dynamically from SQL schema
  const parsedTables = useMemo(() => parseSqlSchema(schemaSql), [schemaSql]);

  // Mermaid Diagram Renderer with robust unique random DOM ID allocation
  useEffect(() => {
    let active = true;
    if (viewMode === 'mermaid' && mermaidCode) {
      setIsRenderingMermaid(true);
      setMermaidRenderError(null);
      
      try {
        const themeConfig = diagramTheme === 'light' ? {
          background: 'transparent',
          primaryColor: '#f1f5f9',          // En-tête de table clair (Slate 100)
          primaryTextColor: '#0f172a',      // Titre de table noir (Slate 900)
          primaryBorderColor: '#0f172a',    // Bordure noire (Slate 900)
          lineColor: '#0f172a',             // Lignes de relations noires (Slate 900)
          textColor: '#0f172a',             // Texte général noir
          mainBkg: '#ffffff',               // Corps de table blanc pur
          nodeBorder: '#0f172a',            // Bordures des tables noires nettes
          nodeTextColor: '#0f172a',
          attributeTextColor: '#0f172a',    // Attributs noirs
          attributeBackgroundColorEven: '#ffffff',
          attributeBackgroundColorOdd: '#f8fafc',
          fontSize: '14px',
        } : {
          background: 'transparent',
          primaryColor: '#1e293b',          // Table header Slate 800
          primaryTextColor: '#f8fafc',      // Table header text (Slate 50)
          primaryBorderColor: '#60a5fa',    // Table header border (Blue 400)
          lineColor: '#60a5fa',             // Relationship lines (Blue 400)
          textColor: '#f1f5f9',             // General text color (Slate 100)
          mainBkg: '#0f172a',               // Table body background (Slate 900)
          nodeBorder: '#334155',            // Table border (Slate 700)
          nodeTextColor: '#f8fafc',         // Table text color
          attributeTextColor: '#e2e8f0',    // Attribute text color (Slate 200)
          attributeBackgroundColorEven: '#0f172a',
          attributeBackgroundColorOdd: '#172033',
          fontSize: '14px',
        };

        mermaid.initialize({ 
          startOnLoad: false, 
          theme: 'base',
          themeVariables: themeConfig,
          er: {
            useMaxWidth: false,
            entityPadding: 32, // Marges internes généreuses pour que la fin des textes ne soit jamais masquée
            fontSize: 13.5,
            minEntityWidth: 140,
            minEntityHeight: 75,
          },
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
        });
        
        // Generate a completely random ID to bypass any DOM cache collision bugs
        const uniqueId = 'mermaid-' + Math.random().toString(36).substring(2, 9);
        
        mermaid.render(uniqueId, mermaidCode).then((result) => {
          if (active) {
            const sanitized = DOMPurify.sanitize(result.svg, {
              ADD_TAGS: ['foreignObject'],
              HTML_INTEGRATION_POINTS: { 'foreignobject': true }
            });
            setSvgContent(sanitized);
            setIsRenderingMermaid(false);
          }
        }).catch((e) => {
          console.error("Erreur de rendu Mermaid :", e);
          if (active) {
            setMermaidRenderError(e.message || String(e));
            setIsRenderingMermaid(false);
          }
        });
      } catch (err) {
        console.error(err);
        if (active) {
          setMermaidRenderError(err instanceof Error ? err.message : String(err));
          setIsRenderingMermaid(false);
        }
      }
    }
    return () => {
      active = false;
    };
  }, [mermaidCode, viewMode, diagramTheme]);

  // Filter tables/columns based on search query
  const filteredTables = useMemo(() => {
    return parsedTables.filter(t => 
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.columns.some(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [parsedTables, searchTerm]);

  // Handle fallback if no DDL is provided
  if (!schemaSql.trim()) {
    return (
      <div className="schema-visual-empty">
        <HelpCircle size={40} className="schema-visual-empty-icon" />
        <h3 className="schema-visual-empty-title">Bac à sable vide</h3>
        <p className="schema-visual-empty-desc">
          Collez votre script <span className="schema-visual-empty-highlight">CREATE TABLE</span> dans l'onglet Schéma et cliquez sur "Appliquer" pour le visualiser !
        </p>
      </div>
    );
  }

  return (
    <div className={`schema-visual-wrapper ${isFullscreen ? 'schema-visual-fullscreen' : ''}`}>
      {/* Sub-Header Toolbar with Toggle, Search and Fullscreen */}
      <div className="schema-visual-toolbar">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Mode button */}
          <div className="schema-visual-toggle" role="tablist" aria-label="Modes de visualisation du schéma">
            <button
              onClick={() => setViewMode('cards')}
              className={`schema-visual-toggle-btn ${viewMode === 'cards' ? 'schema-visual-toggle-btn-active' : ''}`}
              role="tab"
              aria-selected={viewMode === 'cards'}
            >
              Vue Cartes 🎴
            </button>
            <button
              onClick={() => setViewMode('mermaid')}
              className={`schema-visual-toggle-btn ${viewMode === 'mermaid' ? 'schema-visual-toggle-btn-active' : ''}`}
              role="tab"
              aria-selected={viewMode === 'mermaid'}
            >
              Diagramme 📊
            </button>
          </div>

          {/* Live Filter Search (Only in Cards View) */}
          {viewMode === 'cards' && (
            <div className="schema-visual-search">
              <Search size={12} className="schema-visual-search-icon" />
              <input
                type="text"
                placeholder="Filtrer colonnes / tables..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field schema-visual-search-input"
                aria-label="Filtrer les colonnes et tables"
              />
            </div>
          )}
        </div>

        {/* Actions à droite : Thème & Plein Écran */}
        <div className="flex items-center gap-2">
          {viewMode === 'mermaid' && (
            <button
              onClick={toggleDiagramTheme}
              className="schema-visual-fullscreen-btn"
              title={diagramTheme === 'light' ? "Passer au mode sombre" : "Passer au mode clair (Style papier / noir et blanc)"}
              aria-label={diagramTheme === 'light' ? "Mode sombre" : "Mode papier"}
            >
              {diagramTheme === 'light' ? <Moon size={13} className="text-blue-400" /> : <Sun size={13} className="text-amber-400" />}
              <span className="text-xs">{diagramTheme === 'light' ? 'Sombre 🖤' : 'Papier (Clair) 📄'}</span>
            </button>
          )}

          {isFullscreen && (
            <span className="text-[10px] text-gray-400 hidden sm:inline-block px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono">
              Échap pour quitter
            </span>
          )}
          <button
            onClick={() => setIsFullscreen(prev => !prev)}
            className="schema-visual-fullscreen-btn"
            title={isFullscreen ? "Quitter le plein écran (Échap)" : "Visualiser en plein écran"}
            aria-label={isFullscreen ? "Quitter le plein écran" : "Visualiser en plein écran"}
          >
            {isFullscreen ? <Minimize2 size={13} className="text-amber-400" /> : <Maximize2 size={13} className="text-emerald-400" />}
            <span className="text-xs">{isFullscreen ? 'Réduire' : 'Plein écran'}</span>
          </button>
        </div>
      </div>

      {/* Main visual panel */}
      <div className="schema-visual-panel">
        {viewMode === 'cards' ? (
          <div key="cards-view" className="schema-visual-cards-grid">
            {filteredTables.length === 0 ? (
              <div className="schema-visual-no-match">
                Aucune table ou colonne ne correspond à votre filtre.
              </div>
            ) : (
              filteredTables.map((table) => {
                const isSelected = selectedTable === table.name;
                
                // Check if this table has FK relationships with selected table or vice-versa
                const isLinked = selectedTable !== null && !isSelected && table.columns.some(
                  c => c.isFk && c.refTable?.toLowerCase() === selectedTable.toLowerCase()
                );
                
                const hasSelectedLink = selectedTable !== null && !isSelected && parsedTables.find(
                  t => t.name.toLowerCase() === selectedTable.toLowerCase()
                )?.columns.some(
                  c => c.isFk && c.refTable?.toLowerCase() === table.name.toLowerCase()
                );

                let cardClass = "schema-visual-card glass-panel";
                if (isSelected) {
                  cardClass += " schema-visual-card-active";
                } else if (isLinked || hasSelectedLink) {
                  cardClass += " schema-visual-card-linked";
                }

                const handleKeyDown = (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedTable(isSelected ? null : table.name);
                  }
                };

                return (
                  <div
                    key={table.name}
                    onClick={() => setSelectedTable(isSelected ? null : table.name)}
                    onKeyDown={handleKeyDown}
                    className={cardClass}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    aria-label={`Table ${table.name}, contient ${table.columns.length} colonnes. Appuyez pour voir les liaisons.`}
                  >
                    {/* Table Card Header */}
                    <div className="schema-visual-card-header">
                      <div className="schema-visual-card-title-group">
                        <Table size={14} />
                        <span className="schema-visual-card-title">
                          {table.name}
                        </span>
                      </div>
                      <span className="schema-visual-card-badge">
                        {table.columns.length} col
                      </span>
                    </div>

                    {/* Columns List */}
                    <div className="schema-visual-columns-list">
                      {table.columns.map((col) => {
                        const isMatch = searchTerm && (
                          col.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          table.name.toLowerCase().includes(searchTerm.toLowerCase())
                        );

                        const colNameClass = col.isPk 
                          ? 'schema-visual-column-name schema-visual-column-name-pk'
                          : col.isFk
                            ? 'schema-visual-column-name schema-visual-column-name-fk'
                            : 'schema-visual-column-name';

                        return (
                          <div 
                            key={col.name} 
                            className={`schema-visual-column-row ${isMatch ? 'schema-visual-column-row-match' : ''}`}
                          >
                            {/* Column Name + PK/FK Badges */}
                            <div className="schema-visual-column-name-group">
                              {col.isPk && (
                                <span title="Clé Primaire" className="schema-visual-column-icon">
                                  <Key size={10} className="schema-key-pk" />
                                </span>
                              )}
                              {col.isFk && (
                                <span title={`Clé Étrangère référençant ${col.refTable}`} className="schema-visual-column-icon">
                                  <Link2 size={10} className="schema-key-fk" />
                                </span>
                              )}
                              <span className={colNameClass}>
                                {col.name}
                              </span>
                            </div>

                            {/* Column SQL Type Badge */}
                            <span className={`schema-visual-column-type ${getTypeBadgeClass(col.type)}`}>
                              {col.type.replace(/\(\w+\)/, '')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : isVisualizing ? (
          <div key="generating-view" className="schema-visual-mermaid-generating">
            <div className="schema-visual-mermaid-spinner" />
            <h3 className="schema-visual-empty-title">Génération en cours</h3>
            <p className="schema-visual-empty-desc">
              Le LLM local traduit votre schéma SQL en diagramme ER. Cela peut prendre quelques dizaines de secondes...
            </p>
          </div>
        ) : !mermaidCode ? (
          <div key="empty-view" className="schema-visual-mermaid-empty">
            <HelpCircle size={36} className="schema-visual-mermaid-empty-icon" />
            <h3 className="schema-visual-empty-title">Diagramme non généré</h3>
            <p className="schema-visual-empty-desc">
              Pour économiser vos ressources locales, le diagramme n'est plus généré automatiquement au démarrage de la base.
            </p>
            <button
              onClick={onGenerateDiagram}
              className="btn-primary schema-visual-mermaid-btn"
            >
              Générer le diagramme avec l'IA 🪄
            </button>
          </div>
        ) : (
          <div key="mermaid-view" className={`schema-visual-mermaid-wrapper theme-${diagramTheme}`}>
            {/* Zoom Control Panel */}
            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 p-1.5 rounded-xl border border-gray-700/80 bg-gray-950/85 backdrop-blur-lg shadow-xl">
              <button 
                onClick={() => setZoomScale(prev => Math.max(0.4, +(prev - 0.15).toFixed(2)))}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-sm font-semibold cursor-pointer text-gray-200 transition-colors"
                title="Dézoomer (-)"
                aria-label="Dézoomer"
              >
                -
              </button>
              <button 
                onClick={() => setZoomScale(prev => Math.min(4.0, +(prev + 0.15).toFixed(2)))}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-sm font-semibold cursor-pointer text-gray-200 transition-colors"
                title="Zoomer (+)"
                aria-label="Zoomer"
              >
                +
              </button>
              <div className="h-4 w-[1px] bg-gray-700/80 mx-0.5" />
              <button 
                onClick={() => setZoomScale(1.0)}
                className={`px-2 h-7 flex items-center justify-center rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  zoomScale === 1.0 ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'hover:bg-white/10 text-gray-300'
                }`}
                title="Taille réelle (100%)"
              >
                100%
              </button>
              <button 
                onClick={() => setZoomScale(1.35)}
                className={`px-2 h-7 flex items-center justify-center rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  zoomScale === 1.35 ? 'bg-emerald-500/20 text-emerald-300 font-semibold' : 'hover:bg-white/10 text-gray-300'
                }`}
                title="Grand format (135%)"
              >
                135%
              </button>
              <span className="text-xs font-mono text-emerald-400 select-none px-1.5 min-w-[42px] text-right font-medium">
                {Math.round(zoomScale * 100)}%
              </span>
            </div>

            {/* Scroll Area wrapping the scaled SVG container */}
            <div className="schema-visual-mermaid-scrollarea">
              {isRenderingMermaid && !svgContent ? (
                <div className="h-full flex items-center justify-center text-xs animate-pulse text-muted p-6">
                  Génération du diagramme ER...
                </div>
              ) : mermaidRenderError ? (
                <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted">
                  <div className="text-ruby font-semibold text-sm mb-2" style={{ color: 'var(--accent-ruby)' }}>Erreur de rendu du diagramme</div>
                  <p className="text-xs max-w-xs mb-3">Le format du code ER diagramme renvoyé contient des erreurs de syntaxe.</p>
                  <pre className="p-2.5 rounded bg-black/50 border border-subtle text-xs font-mono text-left overflow-auto max-w-full text-muted">
                    <code>{mermaidRenderError}</code>
                  </pre>
                  <div className="text-xs mt-3 font-medium" style={{ color: 'var(--accent-emerald)' }}>💡 Basculez sur la "Vue Cartes" ci-dessus, elle fonctionne parfaitement !</div>
                </div>
              ) : (
                <div 
                  className="schema-visual-mermaid-viewport"
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.15s ease-out',
                    margin: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <div 
                    ref={containerRef} 
                    className="schema-visual-mermaid-container"
                    dangerouslySetInnerHTML={{ __html: svgContent || '' }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
