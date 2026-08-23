export interface ColumnInfo {
  name: string;
  type: string;
  isPk: boolean;
  isFk: boolean;
  refTable?: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

/**
 * Simplifie et abrège universellement les types SQL verbeux (ex: character varying -> varchar, integer -> int).
 * 
 * @param rawType - Le type SQL brut extrait du DDL.
 * @returns Le nom du type abrégé et universel.
 */
export function simplifySqlType(rawType: string): string {
  if (!rawType) return 'text';
  const clean = rawType.toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  
  if (clean.includes('varying') || clean.includes('varchar')) {
    return 'varchar';
  }
  if (clean.startsWith('char')) {
    return 'char';
  }
  if (clean.includes('bigint') || clean.includes('int8') || clean.includes('bigserial')) {
    return 'bigint';
  }
  if (clean.includes('smallint') || clean.includes('int2') || clean.includes('smallserial')) {
    return 'smallint';
  }
  if (clean.includes('int') || clean.includes('serial')) {
    return 'int';
  }
  if (clean.includes('bool')) {
    return 'bool';
  }
  if (clean.includes('double') || clean.includes('float') || clean.includes('real') || clean.includes('numeric') || clean.includes('decimal') || clean.includes('money')) {
    return 'decimal';
  }
  if (clean.includes('timestamp') || clean.includes('timestamptz') || clean.includes('datetime')) {
    return 'timestamp';
  }
  if (clean.includes('time')) {
    return 'time';
  }
  if (clean.includes('date')) {
    return 'date';
  }
  if (clean.includes('uuid')) {
    return 'uuid';
  }
  if (clean.includes('json')) {
    return 'json';
  }
  return 'text';
}

/**
 * Analyse un script SQL DDL (CREATE TABLE) brut pour extraire les métadonnées de tables et de colonnes.
 * Gère les commentaires SQL (-- et /* *\/), les types complexes et les clés primaires/étrangères.
 * 
 * @param sql - Les requêtes DDL CREATE TABLE brutes.
 * @returns La liste des structures TableInfo extraites.
 */
export function parseSqlSchema(sql: string): TableInfo[] {
  const tables: TableInfo[] = [];
  if (!sql) return tables;

  // Nettoyage des commentaires SQL
  const cleanSql = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Regex pour capturer les blocs CREATE TABLE
  const createTableRegex = /CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]*?)\);/gi;
  let match: RegExpExecArray | null;
  
  while ((match = createTableRegex.exec(cleanSql)) !== null) {
    const tableName = match[1];
    const body = match[2];
    
    const columns: ColumnInfo[] = [];
    const lines: string[] = [];
    let currentLine = "";
    let parenDepth = 0;
    
    // Découpage sécurisé par virgule (sans casser les parenthèses de types de données ex: DECIMAL(10,2))
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
      
      // Détection des clés primaires au niveau table
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
      
      // Détection des clés étrangères au niveau table
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
      
      // Détection des contraintes CONSTRAINT ... FOREIGN KEY
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
      
      // Définition de colonne standard
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      
      const colName = parts[0].replace(/['"`]/g, '');
      const rawTypeStr = parts.slice(1).join(' ');
      const colType = simplifySqlType(rawTypeStr);
      
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
