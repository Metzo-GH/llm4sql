import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { BarChart3, LineChart as LineIcon, AreaChart as AreaIcon } from 'lucide-react';

interface DataVisualizationProps {
  data: Record<string, any>[];
}

/**
 * Composant de visualisation dynamique. Il analyse les colonnes de données pour
 * proposer de tracer automatiquement des graphiques Bar, Line ou Area interactifs.
 */
export const DataVisualization: React.FC<DataVisualizationProps> = ({ data }) => {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area'>('bar');
  const [xAxisKey, setXAxisKey] = useState('');
  const [yAxisKey, setYAxisKey] = useState('');
  
  const [numericCols, setNumericCols] = useState<string[]>([]);
  const [textualCols, setTextualCols] = useState<string[]>([]);

  // Analyser les colonnes au chargement des données
  useEffect(() => {
    if (!data || data.length === 0) return;

    const sample = data[0];
    const columns = Object.keys(sample);
    
    const numeric: string[] = [];
    const textual: string[] = [];

    for (const col of columns) {
      const val = sample[col];
      // Vérifier si la valeur ressemble à un nombre
      if (val !== null && val !== undefined && !isNaN(Number(val)) && typeof val !== 'boolean') {
        numeric.push(col);
      } else {
        textual.push(col);
      }
    }

    setNumericCols(numeric);
    setTextualCols(textual);

    // Configurer des axes par défaut intelligents
    if (textual.length > 0) {
      setXAxisKey(textual[0]);
    } else if (columns.length > 0) {
      setXAxisKey(columns[0]);
    }

    if (numeric.length > 0) {
      setYAxisKey(numeric[0]);
    } else if (columns.length > 1) {
      // Fallback si aucune colonne n'est explicitement numérique
      setYAxisKey(columns[1]);
    }
  }, [data]);

  if (!data || data.length === 0) return null;

  // S'il n'y a pas assez de colonnes à tracer, on avertit l'utilisateur
  if (numericCols.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center text-muted" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
        <BarChart3 size={40} className="opacity-40 mb-3" style={{ marginBottom: '12px', opacity: 0.4 }} />
        <h3 className="text-sm font-semibold text-heading mb-1" style={{ color: 'var(--text-heading)', fontWeight: 600 }}>Visualisation indisponible</h3>
        <p className="text-xs max-w-xs" style={{ fontSize: '12px', maxWidth: '280px', margin: 0 }}>
          Les données retournées ne contiennent aucune colonne numérique permettant de tracer un graphique.
        </p>
      </div>
    );
  }

  // Rendu du composant Recharts approprié
  const renderChart = () => {
    // Adapter les données pour s'assurer que les valeurs de l'axe Y sont bien converties en nombres réels
    const chartData = data.map(row => ({
      ...row,
      [yAxisKey]: Number(row[yAxisKey] ?? 0)
    }));

    const commonProps = {
      data: chartData,
      margin: { top: 10, right: 10, left: -10, bottom: 0 }
    };

    // Tooltip customisé avec le thème sombre Glassmorphism HSL
    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        return (
          <div 
            style={{
              background: 'hsl(225, 25%, 10%)',
              border: '1px solid var(--border-active)',
              padding: '10px 14px',
              borderRadius: '8px',
              boxShadow: '0 10px 20px rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)'
            }}
          >
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>{String(xAxisKey).toUpperCase()} : {label}</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: 'var(--accent-secondary)', fontWeight: 700 }}>
              {String(yAxisKey)} : {payload[0].value}
            </p>
          </div>
        );
      }
      return null;
    };

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="var(--text-muted)" fontSize={11} tickLine={false} />
            <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              type="monotone" 
              dataKey={yAxisKey} 
              stroke="var(--accent-primary)" 
              strokeWidth={3}
              activeDot={{ r: 6, stroke: 'var(--bg-deep)', strokeWidth: 2 }}
              dot={{ r: 3, stroke: 'var(--accent-primary)', strokeWidth: 2, fill: 'var(--bg-deep)' }}
            />
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              <linearGradient id="areaGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.4}/>
                <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0.0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="var(--text-muted)" fontSize={11} tickLine={false} />
            <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area 
              type="monotone" 
              dataKey={yAxisKey} 
              stroke="var(--accent-primary)" 
              strokeWidth={2.5}
              fillOpacity={1} 
              fill="url(#areaGlow)" 
            />
          </AreaChart>
        );
      case 'bar':
      default:
        return (
          <BarChart {...commonProps}>
            <defs>
              <linearGradient id="barGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.8}/>
                <stop offset="100%" stopColor="hsl(265, 95%, 60%)" stopOpacity={0.3}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="var(--text-muted)" fontSize={11} tickLine={false} />
            <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Bar 
              dataKey={yAxisKey} 
              fill="url(#barGlow)" 
              radius={[4, 4, 0, 0]}
              maxBarSize={50}
            />
          </BarChart>
        );
    }
  };

  return (
    <div className="flex flex-col h-full gap-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      {/* Barre de commandes du Graphique */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-3" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
        {/* Toggle type de graphe */}
        <div className="flex gap-1" style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setChartType('bar')}
            className={`p-2 rounded-md transition-all ${chartType === 'bar' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px' }}
            title="Histogramme"
          >
            <BarChart3 size={15} />
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`p-2 rounded-md transition-all ${chartType === 'line' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px' }}
            title="Courbe"
          >
            <LineIcon size={15} />
          </button>
          <button
            onClick={() => setChartType('area')}
            className={`p-2 rounded-md transition-all ${chartType === 'area' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px' }}
            title="Aire Remplie"
          >
            <AreaIcon size={15} />
          </button>
        </div>

        {/* Sélecteurs d'axes */}
        <div className="flex flex-wrap items-center gap-3" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <div className="flex items-center gap-1.5" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="text-xs text-muted" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Axe X :</span>
            <select
              value={xAxisKey}
              onChange={(e) => setXAxisKey(e.target.value)}
              className="input-field"
              style={{ padding: '6px 12px', fontSize: '12px', width: 'auto', background: 'hsl(225, 25%, 10%)' }}
            >
              {textualCols.concat(numericCols).map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="text-xs text-muted" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Valeurs Y :</span>
            <select
              value={yAxisKey}
              onChange={(e) => setYAxisKey(e.target.value)}
              className="input-field"
              style={{ padding: '6px 12px', fontSize: '12px', width: 'auto', background: 'hsl(225, 25%, 10%)' }}
            >
              {numericCols.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Rendu graphique interactif */}
      <div className="flex-1 min-h-[350px] w-full" style={{ flex: 1, minHeight: '350px', width: '100%', padding: '8px 0' }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
