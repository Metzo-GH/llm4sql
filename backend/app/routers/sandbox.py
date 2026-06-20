import asyncio
import re
from fastapi import APIRouter, HTTPException
from langchain_core.messages import SystemMessage
from app.services.agent import get_llm
from app.database.pool import init_user_sandbox
from app.schemas import (
    SandboxInitRequest,
    SandboxInitResponse,
    VisualizeRequest,
    VisualizeResponse
)

router = APIRouter(prefix="/api/sandbox", tags=["Sandbox"])


@router.post("/init", response_model=SandboxInitResponse)
async def init_sandbox(request: SandboxInitRequest) -> SandboxInitResponse:
    """
    Initialise un environnement isolé (sandbox) avec le schéma et les données fournis.
    """
    try:
        # Exécuter l'initialisation synchrone de la sandbox dans un thread pool pour éviter de bloquer l'event-loop
        await asyncio.to_thread(
            init_user_sandbox,
            schema_sql=request.schema_sql,
            insert_sql=request.insert_sql
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
        print(f"[Sandbox Init Error] {str(e)}")
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
async def visualize_schema(request: VisualizeRequest) -> VisualizeResponse:
    """
    Convertit un schéma SQL DDL brut en diagramme Mermaid.js de manière déterministe.
    """
    try:
        code = sql_ddl_to_mermaid(request.schema_sql)
        return VisualizeResponse(mermaid_code=code)
    except Exception as e:
        print(f"[Visualize Error] {str(e)}")
        raise HTTPException(status_code=500, detail="Une erreur interne est survenue lors de la génération du diagramme ER.")
