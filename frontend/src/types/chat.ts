export interface AgentStep {
  node: 'semantic_cache' | 'select_tables' | 'generate_sql' | 'execute_sql';
  message?: string;
  selected_tables?: string[];
  elapsed?: number | string;
  iteration?: number;
  prompt_tokens?: number;
  eval_tokens?: number;
  tokens_per_second?: number;
  context_size?: number;
  success?: boolean;
  row_count?: number;
  error?: string;
  model?: string;
}

export interface Message {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  sqlQuery?: string;
  errorMessage?: string;
  iterationCount?: number;
  hasData?: boolean;
  steps?: AgentStep[];
  cacheHit?: boolean;
  tables?: string[];
  thinking?: string;
}

export interface ParsedStep {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  detail?: string;
  elapsed?: string;
  iteration?: number;
}

export interface ContextUsage {
  promptTokens: number;
  evalTokens?: number;
  contextSize: number;
  estimated: boolean;
}

export interface LoadedModelStatus {
  name: string;
  size: number;
  size_vram: number;
  gpu_percent: number;
  cpu_percent: number;
  processor: string;
  context_length: number;
}

export interface SqlResultRow {
  [column: string]: string | number | boolean | null;
}
