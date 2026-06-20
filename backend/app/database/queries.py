# Requêtes SQL réutilisables pour le schéma et les clés étrangères

GET_TABLE_FOREIGN_KEYS_QUERY = """
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
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name = %s
      AND tc.table_schema IN ('user_sandbox', 'public');
"""

GET_ALL_FOREIGN_KEYS_QUERY = """
    SELECT
        kcu.table_name AS foreign_table,
        kcu.column_name AS foreign_column,
        ccu.table_name AS primary_table,
        ccu.column_name AS primary_column
    FROM
        information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema IN ('user_sandbox', 'public')
    ORDER BY foreign_table, foreign_column;
"""
