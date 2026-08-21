import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Download, Search, ChevronLeft, ChevronRight, Table, ArrowUpDown, ArrowUp, ArrowDown, Calculator } from 'lucide-react';
import type { SqlResultRow } from '../types/chat';

export type SortDirection = 'default' | 'asc' | 'desc';
export type PageSizeMode = 'auto' | 10 | 25 | 50 | 'all';

interface SortConfig {
  column: string | null;
  direction: SortDirection;
}

interface DataTableProps {
  data: SqlResultRow[];
  sqlQuery?: string;
}

/**
 * Composant DataTable fournissant l'affichage avec pagination dynamique (adaptée
 * automatiquement à la hauteur du conteneur via ResizeObserver), tri multi-états,
 * barre de statistiques résumées et export CSV natif.
 * 
 * @param props - Component properties containing tabular SQL data
 */
export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: 'default' });
  const [pageSizeMode, setPageSizeMode] = useState<PageSizeMode>('auto');
  const [autoPageSize, setAutoPageSize] = useState(8);

  const columns = useMemo(() => Object.keys((data && data[0]) || {}), [data]);

  // Observer réactif de la hauteur du conteneur pour adapter dynamiquement le nombre de lignes
  useEffect(() => {
    if (!wrapperRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        // Déduire l'espace requis pour la toolbar (45px), l'en-tête (40px), la barre stats (32px) et la pagination (45px)
        const availableHeight = height - 160;
        const rowHeight = 40;
        const calculated = Math.max(3, Math.floor(availableHeight / rowHeight));
        setAutoPageSize(calculated);
      }
    });

    observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  // Résolution du nombre de lignes effectif par page
  const rowsPerPage = useMemo(() => {
    if (pageSizeMode === 'all') return Math.max(1, (data || []).length);
    if (pageSizeMode === 'auto') return autoPageSize;
    return pageSizeMode;
  }, [pageSizeMode, autoPageSize, data]);

  /**
   * Bascule l'état de tri pour une colonne donnée :
   * Cycle : Défaut (ordre SQL d'origine) ➔ ASC ➔ DESC ➔ Défaut
   */
  const handleSort = (col: string) => {
    setSortConfig((prev) => {
      if (prev.column !== col) {
        return { column: col, direction: 'asc' };
      }
      if (prev.direction === 'asc') {
        return { column: col, direction: 'desc' };
      }
      if (prev.direction === 'desc') {
        return { column: null, direction: 'default' };
      }
      return { column: col, direction: 'asc' };
    });
    setCurrentPage(1);
  };

  // Filtrer les données en fonction du terme de recherche puis appliquer le tri
  const filteredData = useMemo(() => {
    if (!data) return [];
    
    // 1. Filtrage par recherche textuelle
    const matches = data.filter((row) =>
      columns.some((col) =>
        String(row[col] ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    );

    // 2. Si aucun tri actif (ou ordre par défaut), préserver l'ordre SQL d'origine
    if (!sortConfig.column || sortConfig.direction === 'default') {
      return matches;
    }

    const col = sortConfig.column;
    const isAsc = sortConfig.direction === 'asc';

    // 3. Tri stable en mémoire
    return [...matches].sort((a, b) => {
      const valA = a[col];
      const valB = b[col];

      // Gestion des valeurs nulles / indéfinies (toujours à la fin)
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      // Comparaison numérique si les deux valeurs sont des nombres
      const numA = Number(valA);
      const numB = Number(valB);
      if (!isNaN(numA) && !isNaN(numB) && typeof valA !== 'boolean' && typeof valB !== 'boolean') {
        return isAsc ? numA - numB : numB - numA;
      }

      // Comparaison textuelle insensible à la casse
      const comp = String(valA).localeCompare(String(valB), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      return isAsc ? comp : -comp;
    });
  }, [data, columns, searchTerm, sortConfig]);

  // Calcul des statistiques résumées sur les colonnes numériques
  const stats = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return null;

    const numericStats: Record<string, { sum: number; avg: number; min: number; max: number }> = {};
    for (const col of columns) {
      const validNumbers = filteredData
        .map((r) => r[col])
        .filter((val) => val !== null && val !== undefined && val !== '' && !isNaN(Number(val)) && typeof val !== 'boolean')
        .map(Number);

      if (validNumbers.length > 0 && validNumbers.length === filteredData.length) {
        const sum = validNumbers.reduce((a, b) => a + b, 0);
        const avg = sum / validNumbers.length;
        const min = Math.min(...validNumbers);
        const max = Math.max(...validNumbers);
        numericStats[col] = { sum, avg, min, max };
      }
    }
    return {
      totalRows: filteredData.length,
      numericStats,
    };
  }, [filteredData, columns]);

  if (!data || data.length === 0) {
    return (
      <div className="data-table-empty">
        <Table size={40} className="data-table-empty-icon" />
        <p className="data-table-empty-desc">Aucun résultat à afficher pour le moment.</p>
      </div>
    );
  }

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  /**
   * Export CSV natif utilisant les Blobs
   */
  const exportToCSV = () => {
    try {
      const csvRows = [];
      // 1. Ajouter les en-têtes
      csvRows.push(columns.join(','));

      // 2. Ajouter les lignes en échappant les valeurs textuelles
      for (const row of data) {
        const values = columns.map((col) => {
          const val = row[col];
          const valStr = val === null || val === undefined ? '' : String(val);
          // Échapper les guillemets et encadrer de guillemets doubles si nécessaire
          const escaped = valStr.replace(/"/g, '""');
          return `"${escaped}"`;
        });
        csvRows.push(values.join(','));
      }

      // 3. Créer un Blob UTF-8 avec BOM pour assurer un import parfait sous Microsoft Excel
      const csvContent = '\uFEFF' + csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `llm4sql_export_${Date.now()}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Échec de l'export CSV :", e);
    }
  };

  return (
    <div ref={wrapperRef} className="data-table-wrapper">
      {/* Barre d'outils (Recherche + Export) */}
      <div className="data-table-toolbar">
        <div className="data-table-search-group">
          <Search size={16} className="data-table-search-icon" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Reset page à 1
            }}
            placeholder="Filtrer les résultats locaux..."
            className="input-field data-table-search-input"
            aria-label="Filtrer les résultats locaux"
          />
        </div>
        <button
          onClick={exportToCSV}
          className="btn-primary data-table-export-btn"
          aria-label="Exporter les données au format CSV"
        >
          <Download size={15} />
          <span>Exporter (CSV)</span>
        </button>
      </div>

      {/* Rendu du tableau SQL */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr className="data-table-header-row">
              {columns.map((col) => {
                const isCurrentCol = sortConfig.column === col;
                const dir = isCurrentCol ? sortConfig.direction : 'default';
                const ariaSortValue = dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none';

                return (
                  <th
                    key={col}
                    onClick={() => handleSort(col)}
                    className="data-table-th data-table-th-sortable"
                    aria-sort={ariaSortValue}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSort(col);
                      }
                    }}
                    title={`Trier par ${col} (actuel : ${
                      dir === 'asc' ? 'Croissant' : dir === 'desc' ? 'Décroissant' : 'Ordre SQL d\'origine'
                    })`}
                  >
                    <div className="data-table-th-content">
                      <span>{col}</span>
                      <span className="data-table-sort-icon">
                        {dir === 'asc' ? (
                          <ArrowUp size={13} className="text-accent-primary" />
                        ) : dir === 'desc' ? (
                          <ArrowDown size={13} className="text-accent-primary" />
                        ) : (
                          <ArrowUpDown size={13} className="opacity-40 hover:opacity-100" />
                        )}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="data-table-empty-row">
                  Aucun résultat ne correspond à votre filtre local.
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="data-table-row"
                >
                  {columns.map((col) => (
                    <td key={col} className="data-table-td">
                      {row[col] === null || row[col] === undefined ? (
                        <span className="data-table-td-null">NULL</span>
                      ) : (
                        String(row[col])
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Barre de statistiques résumées (KPIs) */}
      {stats && (
        <div className="data-table-stats-bar">
          <div className="data-table-stats-item font-semibold text-accent-primary">
            <Calculator size={13} />
            <span>{stats.totalRows} ligne{stats.totalRows > 1 ? 's' : ''}</span>
          </div>
          {Object.entries(stats.numericStats).slice(0, 3).map(([col, s]) => (
            <div key={col} className="data-table-stats-item">
              <span className="text-muted">{col} :</span>
              <span>Moy. {Number.isInteger(s.avg) ? s.avg : s.avg.toFixed(1)}</span>
              <span className="text-muted opacity-40">•</span>
              <span>Min {s.min}</span>
              <span className="text-muted opacity-40">•</span>
              <span>Max {s.max}</span>
            </div>
          ))}
        </div>
      )}

      {/* Pagination & Sélecteur de mode de taille */}
      <div className="data-table-pagination">
        <div className="data-table-pagination-left">
          <span className="data-table-pagination-info">
            {filteredData.length === 0
              ? '0 ligne'
              : `Lignes ${startIndex + 1}-${Math.min(startIndex + rowsPerPage, filteredData.length)} sur ${filteredData.length}`}
          </span>
          <select
            value={pageSizeMode}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'auto' || val === 'all') {
                setPageSizeMode(val);
              } else {
                setPageSizeMode(Number(val) as PageSizeMode);
              }
              setCurrentPage(1);
            }}
            className="data-table-pagesize-select"
            aria-label="Affichage par page"
          >
            <option value="auto">Auto ({autoPageSize} lignes)</option>
            <option value="10">10 lignes</option>
            <option value="25">25 lignes</option>
            <option value="50">50 lignes</option>
            <option value="all">Tout afficher</option>
          </select>
        </div>

        <div className="data-table-pagination-actions">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="btn-secondary data-table-pagination-btn"
            aria-label="Page précédente"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="data-table-pagination-current">
            Page {currentPage} sur {Math.max(1, totalPages)}
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="btn-secondary data-table-pagination-btn"
            aria-label="Page suivante"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};
