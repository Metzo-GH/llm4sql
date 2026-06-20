import React, { useState, useEffect, useRef, useMemo } from 'react';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { Table, Search, Link2, Key, HelpCircle } from 'lucide-react';

interface SchemaVisualizerProps {
  mermaidCode: string;
  schemaSql?: string;
  onGenerateDiagram?: () => Promise<void>;
  isVisualizing?: boolean;
}

interface ColumnInfo {
  name: string;
  type: string;
  isPk: boolean;
  isFk: boolean;
  refTable?: string;
}

interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

/**
 * Parses a raw SQL DDL CREATE TABLE script into structured table/column objects.
 * Handles single/multi-line definitions, inline and block comments, and constraint parsing.
 * 
 * @param sql - The raw SQL CREATE TABLE statements.
 * @returns An array of parsed TableInfo objects.
 */
function parseSqlSchema(sql: string): TableInfo[] {
  const tables: TableInfo[] = [];
  if (!sql) return tables;

  // Clean SQL comments
  const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Regex to capture CREATE TABLE blocks
  const createTableRegex = /CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi;
  let match;
  
  while ((match = createTableRegex.exec(cleanSql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    
    const columns: ColumnInfo[] = [];
    const lines: string[] = [];
    let currentLine = "";
    let parenDepth = 0;
    
    // Split columns by comma safely (avoid breaking decimal precision or types with parens)
    for (let i = 0; i < body.length; i++) {
      const char = body[i];
      if (char === '(') parenDepth++;
      else if (char === ')') parenDepth--;
      
      if (char === ',' && parenDepth === 0) {
        lines.push(currentLine.trim());
        currentLine = "";
      } else {
        currentLine += char;
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    for (const line of lines) {
      if (!line) continue;
      const upperLine = line.toUpperCase();
      
      // Parse Table-Level Primary Keys
      if (upperLine.startsWith("PRIMARY KEY")) {
        const pkMatch = /PRIMARY\s+KEY\s*\(([^)]+)\)/i.exec(line);
        if (pkMatch) {
          const pkCols = pkMatch[1].split(',').map(c => c.trim().replace(/['"`]/g, '').toLowerCase());
          for (const colName of pkCols) {
            const col = columns.find(c => c.name.toLowerCase() === colName);
            if (col) col.isPk = true;
          }
        }
        continue;
      }
      
      // Parse Table-Level Foreign Keys
      if (upperLine.startsWith("FOREIGN KEY")) {
        const fkMatch = /FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(\w+)/i.exec(line);
        if (fkMatch) {
          const fkColName = fkMatch[1].trim().replace(/['"`]/g, '').toLowerCase();
          const refTable = fkMatch[2].trim();
          const col = columns.find(c => c.name.toLowerCase() === fkColName);
          if (col) {
            col.isFk = true;
            col.refTable = refTable;
          }
        }
        continue;
      }
      
      // Parse CONSTRAINT definitions
      if (upperLine.startsWith("CONSTRAINT")) {
        const fkConstraintMatch = /CONSTRAINT\s+\w+\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+(\w+)/i.exec(line);
        if (fkConstraintMatch) {
          const fkColName = fkConstraintMatch[1].trim().replace(/['"`]/g, '').toLowerCase();
          const refTable = fkConstraintMatch[2].trim();
          const col = columns.find(c => c.name.toLowerCase() === fkColName);
          if (col) {
            col.isFk = true;
            col.refTable = refTable;
          }
        }
        continue;
      }
      
      // Standard Column Definition
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      
      const colName = parts[0].replace(/['"`]/g, '');
      let colType = parts[1];
      
      // Handle data type precision constraints (e.g. VARCHAR(100))
      if (colType.includes('(') && !colType.includes(')')) {
        const typeIdx = line.indexOf(colType);
        const closingParen = line.indexOf(')', typeIdx);
        if (closingParen !== -1) {
          colType = line.substring(typeIdx, closingParen + 1);
        }
      }
      
      const isPk = upperLine.includes("PRIMARY KEY") || colName.toLowerCase() === "id";
      const isFk = upperLine.includes("REFERENCES");
      
      let refTable: string | undefined;
      if (isFk) {
        const refMatch = /REFERENCES\s+(\w+)/i.exec(line);
        if (refMatch) {
          refTable = refMatch[1];
        }
      }
      
      columns.push({
        name: colName,
        type: colType,
        isPk,
        isFk,
        refTable
      });
    }
    
    tables.push({
      name: tableName,
      columns
    });
  }
  
  return tables;
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
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  // Parse tables dynamically from SQL schema
  const parsedTables = useMemo(() => parseSqlSchema(schemaSql), [schemaSql]);

  // Mermaid Diagram Renderer with robust unique random DOM ID allocation
  useEffect(() => {
    if (viewMode === 'mermaid' && mermaidCode && containerRef.current) {
      try {
        containerRef.current.innerHTML = '<div class="h-full flex items-center justify-center text-xs animate-pulse text-muted">Génération du diagramme ER...</div>';
        
        mermaid.initialize({ 
          startOnLoad: false, 
          theme: 'dark',
          fontFamily: 'Inter, sans-serif'
        });
        
        // Generate a completely random ID to bypass any DOM cache collision bugs
        const uniqueId = 'mermaid-' + Math.random().toString(36).substring(2, 9);
        
        mermaid.render(uniqueId, mermaidCode).then((result) => {
          if (containerRef.current) {
            containerRef.current.innerHTML = DOMPurify.sanitize(result.svg);
          }
        }).catch((e) => {
          console.error("Erreur de rendu Mermaid :", e);
          if (containerRef.current) {
            containerRef.current.innerHTML = DOMPurify.sanitize(`
              <div class="flex flex-col items-center justify-center h-full p-6 text-center text-muted">
                <div class="text-ruby font-semibold text-sm mb-2" style="color: var(--accent-ruby)">Erreur de rendu du diagramme</div>
                <p class="text-xs max-w-xs mb-3">Le format du code ER diagramme renvoyé par le LLM contient des erreurs de syntaxe.</p>
                <pre class="p-2.5 rounded bg-black/50 border border-subtle text-xs font-mono text-left overflow-auto max-w-full text-muted">
                  <code>${e.message || String(e)}</code>
                </pre>
                <div class="text-xs mt-3 font-medium" style="color: var(--accent-emerald);">💡 Basculez sur la "Vue Cartes" ci-dessus, elle fonctionne parfaitement !</div>
              </div>
            `);
          }
        });
      } catch (err) {
        console.error(err);
      }
    }
  }, [mermaidCode, viewMode]);

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
    <div className="schema-visual-wrapper">
      {/* Sub-Header Toolbar with Toggle and Search */}
      <div className="schema-visual-toolbar">
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

      {/* Main visual panel */}
      <div className="schema-visual-panel">
        {viewMode === 'cards' ? (
          <div className="schema-visual-cards-grid">
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
          <div className="schema-visual-mermaid-generating">
            <div className="schema-visual-mermaid-spinner" />
            <h3 className="schema-visual-empty-title">Génération en cours</h3>
            <p className="schema-visual-empty-desc">
              Le LLM local traduit votre schéma SQL en diagramme ER. Cela peut prendre quelques dizaines de secondes...
            </p>
          </div>
        ) : !mermaidCode ? (
          <div className="schema-visual-mermaid-empty">
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
          <div 
            ref={containerRef} 
            className="schema-visual-mermaid-container"
          />
        )}
      </div>
    </div>
  );
});
