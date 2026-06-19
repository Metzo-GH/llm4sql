import React, { useState } from 'react';
import { Download, Search, ChevronLeft, ChevronRight, Table } from 'lucide-react';

interface DataTableProps {
  data: Record<string, any>[];
  sqlQuery?: string;
}

/**
 * Composant DataTable fournissant l'affichage paginé, filtré de tableaux SQL
 * et un export CSV natif utilisant l'API Blob.
 */
export const DataTable: React.FC<DataTableProps> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  if (!data || data.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        <Table size={40} className="opacity-40 mb-3" style={{ marginBottom: '12px', opacity: 0.4 }} />
        <p className="text-sm" style={{ fontSize: '14px' }}>Aucun résultat à afficher pour le moment.</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  // Filtrer les données en fonction du terme de recherche
  const filteredData = data.filter((row) =>
    columns.some((col) =>
      String(row[col] ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  // Pagination
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  // Export CSV natif utilisant les Blobs
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
    <div className="flex flex-col h-full gap-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Barre d'outils (Recherche + Export) */}
      <div className="flex items-center justify-between gap-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div className="relative flex-1" style={{ display: 'flex', flex: 1, position: 'relative' }}>
          <Search size={16} className="text-muted absolute left-3 top-3.5" style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Reset page à 1
            }}
            placeholder="Filtrer les résultats locaux..."
            className="input-field pl-9"
            style={{ paddingLeft: '36px' }}
          />
        </div>
        <button
          onClick={exportToCSV}
          className="btn-primary"
          style={{ whiteSpace: 'nowrap' }}
        >
          <Download size={15} />
          <span>Exporter (CSV)</span>
        </button>
      </div>

      {/* Rendu du tableau SQL */}
      <div className="flex-1 overflow-x-auto border border-subtle rounded-xl bg-card" style={{ flex: 1, overflowX: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '12px', backgroundColor: 'var(--bg-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'hsla(225, 25%, 9%, 0.5)' }}>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    padding: '12px 16px',
                    fontWeight: 600,
                    color: 'var(--text-heading)',
                    textTransform: 'uppercase',
                    fontSize: '11px',
                    letterSpacing: '0.05em'
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Aucun résultat ne correspond à votre filtre local.
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  style={{
                    borderBottom: rIdx === paginatedData.length - 1 ? 'none' : '1px solid var(--border-subtle)',
                    background: rIdx % 2 === 0 ? 'transparent' : 'hsla(225, 25%, 15%, 0.15)'
                  }}
                >
                  {columns.map((col) => (
                    <td key={col} style={{ padding: '12px 16px', color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                      {row[col] === null || row[col] === undefined ? (
                        <span style={{ fontStyle: 'italic', opacity: 0.5 }}>NULL</span>
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
        <div className="flex items-center justify-between border-t border-subtle pt-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '12px' }}>
          <span className="text-xs text-muted" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Lignes {startIndex + 1} à {Math.min(startIndex + rowsPerPage, filteredData.length)} sur {filteredData.length}
          </span>
          <div className="flex items-center gap-1" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="btn-secondary"
              style={{ padding: '6px 12px' }}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-semibold px-3" style={{ fontSize: '12px', fontWeight: 600 }}>
              Page {currentPage} sur {totalPages}
            </span>
            <button
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="btn-secondary"
              style={{ padding: '6px 12px' }}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
