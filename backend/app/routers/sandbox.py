import asyncio
import re
import logging
from fastapi import APIRouter, HTTPException, Request
from app.database.pool import init_user_sandbox, get_db_conn
from app.core.limiter import limiter

logger = logging.getLogger("llm4sql.sandbox")
from app.schemas import (
    SandboxInitRequest,
    SandboxInitResponse,
    VisualizeRequest,
    VisualizeResponse,
    SandboxSchemaResponse
)

router = APIRouter(prefix="/api/sandbox", tags=["Sandbox"])


@router.post("/init", response_model=SandboxInitResponse)
@limiter.limit("20/minute")
async def init_sandbox(request: Request, sandbox_request: SandboxInitRequest) -> SandboxInitResponse:
    """
    Initialise un environnement isolé (sandbox) avec le schéma et les données fournis.
    """
    try:
        # Exécuter l'initialisation synchrone de la sandbox dans un thread pool pour éviter de bloquer l'event-loop
        await asyncio.to_thread(
            init_user_sandbox,
            schema_sql=sandbox_request.schema_sql,
            insert_sql=sandbox_request.insert_sql
        )
        
        # Mettre à jour le cache mémoire du schéma pour LangGraph
        import app.services.agent as agent_module
        agent_module.invalidate_schema_cache()
        
        return SandboxInitResponse(
            success=True, 
            message="Sandbox initialisée avec succès ! Vous pouvez maintenant interroger votre base."
        )
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Sandbox Init Error] {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur interne est survenue lors de l'initialisation de la sandbox.")


def sql_ddl_to_mermaid(ddl_text: str) -> str:
    """
    Convertit un schéma SQL DDL brut en diagramme Entité-Relation Mermaid (erDiagram).
    Analyse de manière déterministe le texte SQL sans faire appel au LLM ni à une connexion BDD.
    """
    # 1. Nettoyer les commentaires
    # Supprimer les commentaires de ligne (--)
    ddl_text = re.sub(r'--.*$', '', ddl_text, flags=re.MULTILINE)
    # Supprimer les commentaires de bloc (/* */)
    ddl_text = re.sub(r'/\*.*?\*/', '', ddl_text, flags=re.DOTALL)
    
    # 2. Extraire les blocs CREATE TABLE
    matches = re.finditer(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(', ddl_text, re.IGNORECASE)
    
    tables = {}
    relationships = []
    
    for match in matches:
        table_name = match.group(1)
        start_pos = match.end()
        
        # Trouver la parenthèse de fin correspondante pour cette table
        depth = 1
        end_pos = start_pos
        while depth > 0 and end_pos < len(ddl_text):
            char = ddl_text[end_pos]
            if char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
            end_pos += 1
            
        if depth == 0:
            table_body = ddl_text[start_pos:end_pos-1].strip()
        else:
            table_body = ddl_text[start_pos:].strip()
            
        # Découper le corps de la table en lignes en respectant les parenthèses
        lines = []
        current_line = []
        line_depth = 0
        for char in table_body:
            if char == '(':
                line_depth += 1
                current_line.append(char)
            elif char == ')':
                line_depth -= 1
                current_line.append(char)
            elif char == ',' and line_depth == 0:
                lines.append("".join(current_line).strip())
                current_line = []
            else:
                current_line.append(char)
        if current_line:
            lines.append("".join(current_line).strip())
            
        columns = []
        table_pks = set()
        table_fks = {} # colonne -> table_parente
        
        for line in lines:
            if not line:
                continue
                
            # Vérifier si c'est une contrainte de clé primaire au niveau table
            pk_match = re.match(r'PRIMARY\s+KEY\s*\((.*?)\)', line, re.IGNORECASE)
            if pk_match:
                pk_cols = [c.strip().strip('"').strip('`') for c in pk_match.group(1).split(',')]
                table_pks.update(pk_cols)
                continue
                
            # Vérifier si c'est une contrainte de clé étrangère au niveau table
            fk_match = re.search(r'(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\((.*?)\)\s*REFERENCES\s+(\w+)\s*\((.*?)\)', line, re.IGNORECASE)
            if fk_match:
                fk_col = fk_match.group(1).strip().strip('"').strip('`')
                parent_table = fk_match.group(2)
                table_fks[fk_col] = parent_table
                relationships.append((parent_table, table_name, fk_col))
                continue
                
            # Sinon, c'est une définition de colonne
            # Séparer par espaces mais préserver ce qui est dans les parenthèses
            parts = []
            current_part = []
            part_depth = 0
            for char in line:
                if char.isspace() and part_depth == 0:
                    if current_part:
                        parts.append("".join(current_part))
                        current_part = []
                else:
                    if char == '(':
                        part_depth += 1
                    elif char == ')':
                        part_depth -= 1
                    current_part.append(char)
            if current_part:
                parts.append("".join(current_part))
                
            if not parts:
                continue
                
            col_name = parts[0].strip('"').strip('`')
            
            # Ignorer s'il s'agit de contraintes diverses
            if col_name.upper() in ('CONSTRAINT', 'UNIQUE', 'CHECK', 'FOREIGN', 'PRIMARY'):
                continue
                
            col_type = parts[1] if len(parts) > 1 else 'text'
            # Nettoyer le type: varchar(100) -> varchar
            col_type = re.sub(r'\(.*?\)', '', col_type).lower()
            
            # Attributs inline
            is_pk = False
            is_fk = False
            
            line_upper = line.upper()
            if 'PRIMARY KEY' in line_upper:
                is_pk = True
                table_pks.add(col_name)
                
            ref_match = re.search(r'REFERENCES\s+(\w+)\s*\(', line, re.IGNORECASE)
            if ref_match:
                parent_table = ref_match.group(1)
                table_fks[col_name] = parent_table
                relationships.append((parent_table, table_name, col_name))
                is_fk = True
                
            columns.append({
                "name": col_name,
                "type": col_type,
                "is_pk": is_pk,
                "is_fk": is_fk
            })
            
        # Associer les contraintes table-level aux colonnes
        for col in columns:
            if col["name"] in table_pks:
                col["is_pk"] = True
            if col["name"] in table_fks:
                col["is_fk"] = True
                
        tables[table_name] = columns
        
    # 3. Formater en erDiagram Mermaid
    mermaid_lines = ["erDiagram"]
    
    # Écrire les relations
    for parent, child, fk in relationships:
        mermaid_lines.append(f"    {parent} ||--o{{ {child} : \"{fk}\"")
        
    # Écrire les structures de tables
    for table_name, cols in tables.items():
        mermaid_lines.append(f"    {table_name} {{")
        for col in cols:
            attrs = []
            if col["is_pk"]:
                attrs.append("PK")
            if col["is_fk"]:
                attrs.append("FK")
            attrs_str = " " + ", ".join(attrs) if attrs else ""
            
            # Nettoyer pour la syntaxe Mermaid stricte
            cleaned_type = re.sub(r'[^a-zA-Z0-9_]', '', col["type"])
            cleaned_name = re.sub(r'[^a-zA-Z0-9_]', '', col["name"])
            
            # Utiliser des types génériques/simplifiés acceptés par Mermaid
            if not cleaned_type:
                cleaned_type = "text"
                
            mermaid_lines.append(f"        {cleaned_type} {cleaned_name}{attrs_str}")
        mermaid_lines.append("    }")
        
    return "\n".join(mermaid_lines)


@router.post("/visualize", response_model=VisualizeResponse)
@limiter.limit("20/minute")
async def visualize_schema(request: Request, visualize_request: VisualizeRequest) -> VisualizeResponse:
    """
    Convertit un schéma SQL DDL brut en diagramme Mermaid.js de manière déterministe.
    """
    try:
        code = sql_ddl_to_mermaid(visualize_request.schema_sql)
        return VisualizeResponse(mermaid_code=code)
    except Exception as e:
        logger.error(f"[Visualize Error] {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur interne est survenue lors de la génération du diagramme ER.")


def generate_ddl_from_db(schema_name: str) -> str:
    """
    Génère un schéma DDL (CREATE TABLE) complet à partir du dictionnaire de données PostgreSQL.
    """
    with get_db_conn(readonly=True) as conn:
        with conn.cursor() as cur:
            # Récupérer les tables
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = %s AND table_type = 'BASE TABLE'
                ORDER BY table_name;
            """, (schema_name,))
            tables = [r[0] for r in cur.fetchall()]
            
            ddl_parts = []
            
            for table in tables:
                # Récupérer les colonnes de cette table
                cur.execute("""
                    SELECT 
                        column_name, 
                        data_type, 
                        character_maximum_length,
                        is_nullable, 
                        column_default
                    FROM 
                        information_schema.columns 
                    WHERE 
                        table_schema = %s AND table_name = %s
                    ORDER BY 
                        ordinal_position;
                """, (schema_name, table))
                cols = cur.fetchall()
                
                # Récupérer la clé primaire
                cur.execute("""
                    SELECT kcu.column_name
                    FROM 
                        information_schema.table_constraints tc 
                        JOIN information_schema.key_column_usage kcu 
                          ON tc.constraint_name = kcu.constraint_name 
                          AND tc.table_schema = kcu.table_schema
                    WHERE 
                        tc.constraint_type = 'PRIMARY KEY' 
                        AND tc.table_schema = %s AND tc.table_name = %s;
                """, (schema_name, table))
                pks = [r[0] for r in cur.fetchall()]
                
                # Récupérer les clés étrangères
                cur.execute("""
                    SELECT
                        kcu.column_name AS local_column,
                        ccu.table_name AS foreign_table,
                        ccu.column_name AS foreign_column
                    FROM
                        information_schema.table_constraints AS tc
                        JOIN information_schema.key_column_usage AS kcu
                          ON tc.constraint_name = kcu.constraint_name
                          AND tc.table_schema = kcu.table_schema
                        JOIN information_schema.constraint_column_usage AS ccu
                          ON ccu.constraint_name = tc.constraint_name
                          AND ccu.table_schema = tc.table_schema
                    WHERE 
                        tc.constraint_type = 'FOREIGN KEY'
                        AND tc.table_schema = %s AND tc.table_name = %s;
                """, (schema_name, table))
                fks = cur.fetchall()
                
                col_defs = []
                for col_name, data_type, max_len, is_nullable, col_default in cols:
                    col_type = data_type
                    if max_len:
                        col_type = f"{data_type}({max_len})"
                    
                    null_str = " NOT NULL" if is_nullable == "NO" else ""
                    default_str = f" DEFAULT {col_default}" if col_default else ""
                    col_defs.append(f"    {col_name} {col_type.upper()}{null_str}{default_str}")
                
                # Ajouter la clé primaire
                if pks:
                    col_defs.append(f"    PRIMARY KEY ({', '.join(pks)})")
                    
                # Ajouter les clés étrangères
                for local_col, foreign_table, foreign_col in fks:
                    col_defs.append(f"    FOREIGN KEY ({local_col}) REFERENCES {foreign_table}({foreign_col})")
                    
                table_ddl = f"CREATE TABLE {table} (\n" + ",\n".join(col_defs) + "\n);"
                ddl_parts.append(table_ddl)
                
            return "\n\n".join(ddl_parts)


def generate_mermaid_from_db(schema_name: str) -> str:
    """
    Génère le code Mermaid ER diagramme à partir du dictionnaire de données PostgreSQL.
    """
    with get_db_conn(readonly=True) as conn:
        with conn.cursor() as cur:
            # 1. Récupérer les colonnes
            cur.execute("""
                SELECT 
                    table_name, 
                    column_name, 
                    data_type, 
                    is_nullable
                FROM 
                    information_schema.columns 
                WHERE 
                    table_schema = %s
                ORDER BY 
                    table_name, 
                    ordinal_position;
            """, (schema_name,))
            columns_rows = cur.fetchall()
            
            # 2. Récupérer les clés primaires
            cur.execute("""
                SELECT 
                    kcu.table_name, 
                    kcu.column_name
                FROM 
                    information_schema.table_constraints tc 
                    JOIN information_schema.key_column_usage kcu 
                      ON tc.constraint_name = kcu.constraint_name 
                      AND tc.table_schema = kcu.table_schema
                WHERE 
                    tc.constraint_type = 'PRIMARY KEY' 
                    AND tc.table_schema = %s;
            """, (schema_name,))
            pk_rows = cur.fetchall()
            pks = {(r[0], r[1]) for r in pk_rows}
            
            # 3. Récupérer les clés étrangères
            cur.execute("""
                SELECT
                    kcu.table_name AS child_table,
                    kcu.column_name AS child_column,
                    ccu.table_name AS parent_table,
                    ccu.column_name AS parent_column
                FROM
                    information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                      ON tc.constraint_name = kcu.constraint_name
                      AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                      ON ccu.constraint_name = tc.constraint_name
                      AND ccu.table_schema = tc.table_schema
                WHERE 
                    tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = %s;
            """, (schema_name,))
            fk_rows = cur.fetchall()
            
    # Structurer Mermaid
    tables = {}
    
    for table_name, col_name, data_type, is_nullable in columns_rows:
        if table_name not in tables:
            tables[table_name] = []
        
        is_pk = (table_name, col_name) in pks
        is_fk = any(r[0] == table_name and r[1] == col_name for r in fk_rows)
        
        # Nettoyage types
        clean_type = re.sub(r'\(.*?\)', '', data_type).lower()
        clean_type = re.sub(r'[^a-zA-Z0-9_]', '', clean_type)
        if not clean_type:
            clean_type = "text"
            
        tables[table_name].append({
            "name": col_name,
            "type": clean_type,
            "is_pk": is_pk,
            "is_fk": is_fk
        })
        
    mermaid_lines = ["erDiagram"]
    
    # Ajouter les relations
    added_relations = set()
    for child_table, child_column, parent_table, parent_column in fk_rows:
        relation_key = (parent_table, child_table, child_column)
        if relation_key not in added_relations:
            mermaid_lines.append(f"    {parent_table} ||--o{{ {child_table} : \"{child_column}\"")
            added_relations.add(relation_key)
            
    # Ajouter les tables
    for table_name, cols in tables.items():
        mermaid_lines.append(f"    {table_name} {{")
        for col in cols:
            attrs = []
            if col["is_pk"]:
                attrs.append("PK")
            if col["is_fk"]:
                attrs.append("FK")
            attrs_str = " " + ", ".join(attrs) if attrs else ""
            cleaned_name = re.sub(r'[^a-zA-Z0-9_]', '', col["name"])
            mermaid_lines.append(f"        {col['type']} {cleaned_name}{attrs_str}")
        mermaid_lines.append("    }")
        
    return "\n".join(mermaid_lines)


@router.get("/schema", response_model=SandboxSchemaResponse)
async def get_current_sandbox_schema() -> SandboxSchemaResponse:
    """
    Récupère la structure DDL et le diagramme Mermaid actuellement configurés dans le sandbox.
    S'il n'y a aucune table dans la sandbox, se replie sur le schéma public.
    """
    try:
        # 1. Vérifier si user_sandbox contient des tables
        schema_to_use = 'user_sandbox'
        with get_db_conn(readonly=True) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT COUNT(*) 
                    FROM information_schema.tables 
                    WHERE table_schema = 'user_sandbox' AND table_type = 'BASE TABLE';
                """)
                count = cur.fetchone()[0]
                if count == 0:
                    schema_to_use = 'public'
                    
        # 2. Générer le DDL et le diagramme de manière asynchrone
        ddl_sql = await asyncio.to_thread(generate_ddl_from_db, schema_to_use)
        mermaid_code = await asyncio.to_thread(generate_mermaid_from_db, schema_to_use)
        
        return SandboxSchemaResponse(
            schema_sql=ddl_sql,
            mermaid_code=mermaid_code,
            active_schema=schema_to_use
        )
    except Exception as e:
        logger.error(f"[Get Sandbox Schema Error] {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur interne est survenue lors de l'extraction du schéma actuel.")
