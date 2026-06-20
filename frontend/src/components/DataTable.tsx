import React, { useState, useMemo } from 'react';
import { Download, Search, ChevronLeft, ChevronRight, Table } from 'lucide-react';
import type { SqlResultRow } from '../types/chat';

interface DataTableProps {
  data: SqlResultRow[];
  sqlQuery?: string;
}

/**
 * Composant DataTable fournissant l'affichage paginé, filtré de tableaux SQL
 * et un export CSV natif utilisant l'API Blob.
 * 
 * @param props - Component properties containing tabular SQL data
 */
export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  const columns = useMemo(() => Object.keys((data && data[0]) || {}), [data]);

  // Filtrer les données en fonction du terme de recherche
  const filteredData = useMemo(() => {
    if (!data) return [];
    return data.filter((row) =>
      columns.some((col) =>
        String(row[col] ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, columns, searchTerm]);

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
    <div className="data-table-wrapper">
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
              {columns.map((col) => (
                <th
                  key={col}
                  className="data-table-th"
                >
                  {col}
                </th>
              ))}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="data-table-pagination">
          <span className="data-table-pagination-info">
            Lignes {startIndex + 1} à {Math.min(startIndex + rowsPerPage, filteredData.length)} sur {filteredData.length}
          </span>
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
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="btn-secondary data-table-pagination-btn"
              aria-label="Page suivante"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
