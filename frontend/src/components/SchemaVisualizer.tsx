import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';
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
 * Gets a CSS color theme class based on the SQL data type of the column.
 * 
 * @param type - The string name of the SQL type.
 * @returns CSS styles object for the badge.
 */
function getTypeBadgeStyle(type: string): React.CSSProperties {
  const t = type.toLowerCase();
  if (t.includes('int') || t.includes('num') || t.includes('decimal') || t.includes('double') || t.includes('real')) {
    return { backgroundColor: 'hsla(160, 95%, 40%, 0.12)', color: 'hsl(160, 95%, 65%)', border: '1px solid hsla(160, 95%, 40%, 0.25)' };
  }
  if (t.includes('char') || t.includes('text') || t.includes('uuid')) {
    return { backgroundColor: 'hsla(35, 95%, 55%, 0.12)', color: 'hsl(35, 95%, 75%)', border: '1px solid hsla(35, 95%, 55%, 0.25)' };
  }
  if (t.includes('date') || t.includes('time')) {
    return { backgroundColor: 'hsla(15, 95%, 50%, 0.12)', color: 'hsl(15, 95%, 70%)', border: '1px solid hsla(15, 95%, 50%, 0.25)' };
  }
  return { backgroundColor: 'hsla(215, 25%, 35%, 0.12)', color: 'var(--text-muted)', border: '1px solid hsla(215, 25%, 35%, 0.25)' };
}

/**
 * SchemaVisualizer Component that offers both a 100% robust interactive Card Explorer
 * and a fixed Mermaid ER Diagram renderer.
 */
export const SchemaVisualizer: React.FC<SchemaVisualizerProps> = ({ 
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
  const parsedTables = parseSqlSchema(schemaSql);

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
            containerRef.current.innerHTML = result.svg;
          }
        }).catch((e) => {
          console.error("Erreur de rendu Mermaid :", e);
          if (containerRef.current) {
            containerRef.current.innerHTML = `
              <div class="flex flex-col items-center justify-center h-full p-6 text-center text-muted">
                <div style="color: var(--accent-ruby); font-weight: 600; font-size: 13px; margin-bottom: 8px;">Erreur de rendu du diagramme</div>
                <p class="text-xs max-w-xs mb-3">Le format du code ER diagramme renvoyé par le LLM contient des erreurs de syntaxe.</p>
                <pre style="padding: 10px; background: rgba(0,0,0,0.5); border: 1px solid var(--border-subtle); border-radius: 6px; font-size: 10px; text-align: left; max-width: 100%; overflow-x: auto; color: var(--text-muted)">
                  <code>${e.message || String(e)}</code>
                </pre>
                <div class="text-xs mt-3 font-medium" style="color: var(--accent-emerald);">💡 Basculez sur la "Vue Cartes" ci-dessus, elle fonctionne parfaitement !</div>
              </div>
            `;
          }
        });
      } catch (err) {
        console.error(err);
      }
    }
  }, [mermaidCode, viewMode]);

  // Handle fallback if no DDL is provided
  if (!schemaSql.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted text-center p-6" style={{ height: '100%' }}>
        <HelpCircle size={40} className="opacity-30 mb-3" style={{ marginBottom: '12px', opacity: 0.3 }} />
        <h3 className="text-sm font-semibold text-heading mb-1" style={{ color: 'var(--text-heading)', fontWeight: 600 }}>Bac à sable vide</h3>
        <p className="text-xs max-w-xs" style={{ fontSize: '12px', maxWidth: '280px', margin: 0 }}>
          Collez votre script <span className="font-semibold text-primary" style={{ color: 'var(--accent-primary)' }}>CREATE TABLE</span> dans l'onglet Schéma et cliquez sur "Appliquer" pour le visualiser !
        </p>
      </div>
    );
  }

  // Filter tables/columns based on search query
  const filteredTables = parsedTables.filter(t => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.columns.some(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex flex-col h-full gap-3" style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
      {/* Sub-Header Toolbar with Toggle and Search */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-subtle pb-2 mb-2" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
        {/* Toggle Mode button */}
        <div className="flex bg-surface rounded-lg p-0.5" style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--bg-card)', padding: '2px', borderRadius: '8px' }}>
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-1 rounded-md text-xs transition-all ${viewMode === 'cards' ? 'bg-primary text-white font-semibold' : 'text-muted'}`}
            style={{ border: 'none', background: viewMode === 'cards' ? 'var(--accent-primary)' : 'transparent', color: viewMode === 'cards' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', padding: '6px 12px' }}
          >
            Vue Cartes 🎴
          </button>
          <button
            onClick={() => setViewMode('mermaid')}
            className={`px-3 py-1 rounded-md text-xs transition-all ${viewMode === 'mermaid' ? 'bg-primary text-white font-semibold' : 'text-muted'}`}
            style={{ border: 'none', background: viewMode === 'mermaid' ? 'var(--accent-primary)' : 'transparent', color: viewMode === 'mermaid' ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontSize: '11px', padding: '6px 12px' }}
          >
            Diagramme 📊
          </button>
        </div>

        {/* Live Filter Search (Only in Cards View) */}
        {viewMode === 'cards' && (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={12} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Filtrer colonnes / tables..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field text-xs"
              style={{ padding: '4px 8px 4px 26px', fontSize: '11px', width: '160px', background: 'var(--bg-card)' }}
            />
          </div>
        )}
      </div>

      {/* Main visual panel */}
      <div className="flex-1 min-h-0" style={{ flex: 1, minHeight: 0 }}>
        {viewMode === 'cards' ? (
          <div 
            className="w-full h-full overflow-y-auto pr-1" 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
              gap: '12px', 
              maxHeight: '100%',
              overflowY: 'auto'
            }}
          >
            {filteredTables.length === 0 ? (
              <div className="col-span-full text-center text-xs text-muted py-6" style={{ gridColumn: '1 / -1' }}>
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

                const activeBorderColor = isSelected 
                  ? 'var(--accent-primary)' 
                  : (isLinked || hasSelectedLink) 
                    ? 'var(--accent-secondary)' 
                    : 'var(--border-subtle)';

                return (
                  <div
                    key={table.name}
                    onClick={() => setSelectedTable(isSelected ? null : table.name)}
                    className="glass-panel transition-all duration-300"
                    style={{
                      borderRadius: '12px',
                      padding: '12px',
                      cursor: 'pointer',
                      border: `1.5px solid ${activeBorderColor}`,
                      background: isSelected 
                        ? 'hsla(265, 95%, 65%, 0.05)' 
                        : (isLinked || hasSelectedLink)
                          ? 'hsla(195, 95%, 45%, 0.04)'
                          : 'var(--bg-card)',
                      boxShadow: isSelected 
                        ? '0 0 15px -3px hsla(265, 95%, 65%, 0.2)' 
                        : 'none',
                      transform: isSelected ? 'scale(1.02)' : 'none'
                    }}
                  >
                    {/* Table Card Header */}
                    <div className="flex items-center justify-between mb-2.5" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <div className="flex items-center gap-1.5" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Table size={14} style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)' }} />
                        <span className="font-semibold text-xs text-heading" style={{ fontWeight: 700, fontSize: '12px' }}>
                          {table.name}
                        </span>
                      </div>
                      <span 
                        className="text-[9px] px-1.5 py-0.5 rounded-full" 
                        style={{ background: 'var(--border-subtle)', color: 'var(--text-muted)' }}
                      >
                        {table.columns.length} col
                      </span>
                    </div>

                    {/* Columns List */}
                    <div className="flex flex-col gap-1.5" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {table.columns.map((col) => {
                        const isMatch = searchTerm && (
                          col.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          table.name.toLowerCase().includes(searchTerm.toLowerCase())
                        );

                        return (
                          <div 
                            key={col.name} 
                            className="flex items-center justify-between py-1 px-1.5 rounded transition-colors"
                            style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'space-between',
                              background: isMatch ? 'rgba(234, 179, 8, 0.08)' : 'transparent',
                              borderRadius: '4px'
                            }}
                          >
                            {/* Column Name + PK/FK Badges */}
                            <div className="flex items-center gap-1" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {col.isPk && (
                                <span title="Clé Primaire" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                  <Key 
                                    size={10} 
                                    style={{ color: 'hsl(265, 95%, 70%)', filter: 'drop-shadow(0 0 3px hsla(265, 95%, 70%, 0.4))' }} 
                                  />
                                </span>
                              )}
                              {col.isFk && (
                                <span title={`Clé Étrangère référençant ${col.refTable}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
                                  <Link2 
                                    size={10} 
                                    style={{ color: 'hsl(195, 95%, 65%)' }} 
                                  />
                                </span>
                              )}
                              <span 
                                className="text-xs" 
                                style={{ 
                                  fontWeight: (col.isPk || col.isFk) ? 600 : 400,
                                  color: col.isPk 
                                    ? 'hsl(265, 95%, 85%)' 
                                    : col.isFk 
                                      ? 'hsl(195, 95%, 80%)' 
                                      : 'var(--text-main)',
                                  fontSize: '11px'
                                }}
                              >
                                {col.name}
                              </span>
                            </div>

                            {/* Column SQL Type Badge */}
                            <span 
                              className="text-[9px] font-mono px-1.5 py-0.5 rounded uppercase" 
                              style={getTypeBadgeStyle(col.type)}
                            >
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
          <div className="w-full h-full flex flex-col items-center justify-center text-center text-muted p-4 bg-surface-solid rounded-lg border border-subtle" style={{ height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3" style={{ borderBottomColor: 'var(--accent-primary)', width: '32px', height: '32px', borderLeftWidth: '2px', borderRightWidth: '2px', borderTopWidth: '2px', borderBottomWidth: '2px', borderRadius: '50%', borderStyle: 'solid', borderColor: 'transparent' }} />
            <h3 className="text-sm font-semibold text-heading mb-1" style={{ color: 'var(--text-heading)', fontWeight: 600 }}>Génération en cours</h3>
            <p className="text-xs max-w-xs" style={{ fontSize: '12px', maxWidth: '280px', margin: 0 }}>
              Le LLM local traduit votre schéma SQL en diagramme ER. Cela peut prendre quelques dizaines de secondes...
            </p>
          </div>
        ) : !mermaidCode ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-center text-muted p-4 bg-surface-solid rounded-lg border border-subtle" style={{ height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
            <HelpCircle size={36} className="opacity-40 mb-3" style={{ marginBottom: '12px', opacity: 0.4, color: 'var(--accent-primary)' }} />
            <h3 className="text-sm font-semibold text-heading mb-1" style={{ color: 'var(--text-heading)', fontWeight: 600 }}>Diagramme non généré</h3>
            <p className="text-xs max-w-xs mb-4" style={{ fontSize: '12px', maxWidth: '280px', margin: '0 0 16px 0' }}>
              Pour économiser vos ressources locales, le diagramme n'est plus généré automatiquement au démarrage de la base.
            </p>
            <button
              onClick={onGenerateDiagram}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
              style={{ fontSize: '12px', cursor: 'pointer' }}
            >
              Générer le diagramme avec l'IA 🪄
            </button>
          </div>
        ) : (
          <div 
            ref={containerRef} 
            className="w-full h-full overflow-auto flex items-center justify-center p-4 bg-surface-solid rounded-lg border border-subtle"
            style={{ height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          />
        )}
      </div>
    </div>
  );
};
