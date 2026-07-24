import React, { useState, useMemo } from 'react';
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
import type { SqlResultRow } from '../types/chat';

interface DataVisualizationProps {
  data: SqlResultRow[];
}

interface TooltipPayloadItem {
  value: string | number;
  name: string;
  payload: Record<string, unknown>;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  xAxisKey: string;
  yAxisKey: string;
}

/**
 * Tooltip customisé avec le thème sombre Glassmorphism HSL
 * 
 * @param props - Tooltip properties from Recharts
 */
const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label, xAxisKey, yAxisKey }) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip-box">
        <p className="custom-tooltip-label">{String(xAxisKey).toUpperCase()} : {label}</p>
        <p className="custom-tooltip-val">
          {String(yAxisKey)} : {payload[0].value}
        </p>
      </div>
    );
  }
  return null;
};

/**
 * Composant de visualisation dynamique. Il analyse les colonnes de données pour
 * proposer de tracer automatiquement des graphiques Bar, Line ou Area interactifs.
 * 
 * @param props - Component properties containing results dataset
 */
export const DataVisualization: React.FC<DataVisualizationProps> = React.memo(({ data }) => {
  const [chartType, setChartType] = useState<'bar' | 'line' | 'area'>('bar');
  const [userXAxisKey, setUserXAxisKey] = useState('');
  const [userYAxisKey, setUserYAxisKey] = useState('');

  const { numericCols, textualCols, defaultXAxisKey, defaultYAxisKey } = useMemo(() => {
    if (!data || data.length === 0) {
      return { numericCols: [], textualCols: [], defaultXAxisKey: '', defaultYAxisKey: '' };
    }

    const sample = data[0];
    const columns = Object.keys(sample);

    const numeric: string[] = [];
    const textual: string[] = [];

    for (const col of columns) {
      const val = sample[col];
      if (val !== null && val !== undefined && !isNaN(Number(val)) && typeof val !== 'boolean') {
        numeric.push(col);
      } else {
        textual.push(col);
      }
    }

    const defaultX = textual.length > 0 ? textual[0] : (columns[0] || '');
    const defaultY = numeric.length > 0 ? numeric[0] : (columns[1] || columns[0] || '');

    return {
      numericCols: numeric,
      textualCols: textual,
      defaultXAxisKey: defaultX,
      defaultYAxisKey: defaultY,
    };
  }, [data]);

  const xAxisKey = userXAxisKey || defaultXAxisKey;
  const yAxisKey = userYAxisKey || defaultYAxisKey;

  if (!data || data.length === 0) return null;

  // S'il n'y a pas assez de colonnes à tracer, on avertit l'utilisateur
  if (numericCols.length === 0) {
    return (
      <div className="data-vis-empty">
        <BarChart3 size={40} className="data-vis-empty-icon" />
        <h3 className="data-vis-empty-title">Visualisation indisponible</h3>
        <p className="data-vis-empty-desc">
          Les données retournées ne contiennent aucune colonne numérique permettant de tracer un graphique.
        </p>
      </div>
    );
  }

  /**
   * Rendu du composant Recharts approprié
   */
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

    switch (chartType) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey={xAxisKey} stroke="var(--text-muted)" fontSize={11} tickLine={false} />
            <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
            <Tooltip content={<CustomTooltip xAxisKey={xAxisKey} yAxisKey={yAxisKey} />} />
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
            <Tooltip content={<CustomTooltip xAxisKey={xAxisKey} yAxisKey={yAxisKey} />} />
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
            <Tooltip content={<CustomTooltip xAxisKey={xAxisKey} yAxisKey={yAxisKey} />} />
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
    <div className="data-vis-wrapper">
      {/* Barre de commandes du Graphique */}
      <div className="data-vis-toolbar">
        {/* Toggle type de graphe */}
        <div className="data-vis-chart-toggles">
          <button
            onClick={() => setChartType('bar')}
            className={`p-2 rounded-md transition-all ${chartType === 'bar' ? 'btn-primary' : 'btn-secondary'}`}
            title="Histogramme"
            aria-label="Histogramme"
          >
            <BarChart3 size={15} />
          </button>
          <button
            onClick={() => setChartType('line')}
            className={`p-2 rounded-md transition-all ${chartType === 'line' ? 'btn-primary' : 'btn-secondary'}`}
            title="Courbe"
            aria-label="Courbe"
          >
            <LineIcon size={15} />
          </button>
          <button
            onClick={() => setChartType('area')}
            className={`p-2 rounded-md transition-all ${chartType === 'area' ? 'btn-primary' : 'btn-secondary'}`}
            title="Aire Remplie"
            aria-label="Aire Remplie"
          >
            <AreaIcon size={15} />
          </button>
        </div>

        {/* Sélecteurs d'axes */}
        <div className="data-vis-selectors">
          <div className="data-vis-axis-group">
            <span className="data-vis-axis-label">Axe X :</span>
            <select
              value={xAxisKey}
              onChange={(e) => setUserXAxisKey(e.target.value)}
              className="input-field data-vis-axis-select"
              aria-label="Sélectionner la colonne pour l'axe X"
            >
              {textualCols.concat(numericCols).map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          <div className="data-vis-axis-group">
            <span className="data-vis-axis-label">Valeurs Y :</span>
            <select
              value={yAxisKey}
              onChange={(e) => setUserYAxisKey(e.target.value)}
              className="input-field data-vis-axis-select"
              aria-label="Sélectionner la colonne pour les valeurs de l'axe Y"
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
      <div className="data-vis-chart-body">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  );
});
