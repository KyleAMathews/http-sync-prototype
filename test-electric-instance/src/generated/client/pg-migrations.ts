export default [
  {
    "statements": [
      "CREATE TABLE issues (\n    id uuid NOT NULL,\n    title text NOT NULL,\n    CONSTRAINT issues_pkey PRIMARY KEY (id)\n)",
      "INSERT INTO \"public\".\"_electric_trigger_settings\" (\"namespace\", \"tablename\", \"flag\")\n  VALUES ('public', 'issues', 1)\n  ON CONFLICT DO NOTHING;",
      "DROP TRIGGER IF EXISTS update_ensure_public_issues_primarykey ON \"public\".\"issues\";",
      "CREATE OR REPLACE FUNCTION update_ensure_public_issues_primarykey_function()\nRETURNS TRIGGER AS $$\nBEGIN\n  IF OLD.\"id\" IS DISTINCT FROM NEW.\"id\" THEN\n    RAISE EXCEPTION 'Cannot change the value of column id as it belongs to the primary key';\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;",
      "CREATE TRIGGER update_ensure_public_issues_primarykey\n  BEFORE UPDATE ON \"public\".\"issues\"\n    FOR EACH ROW\n      EXECUTE FUNCTION update_ensure_public_issues_primarykey_function();",
      "DROP TRIGGER IF EXISTS insert_public_issues_into_oplog ON \"public\".\"issues\";",
      "    CREATE OR REPLACE FUNCTION insert_public_issues_into_oplog_function()\n    RETURNS TRIGGER AS $$\n    BEGIN\n      DECLARE\n        flag_value INTEGER;\n      BEGIN\n        -- Get the flag value from _electric_trigger_settings\n        SELECT flag INTO flag_value FROM \"public\"._electric_trigger_settings WHERE namespace = 'public' AND tablename = 'issues';\n\n        IF flag_value = 1 THEN\n          -- Insert into _electric_oplog\n          INSERT INTO \"public\"._electric_oplog (namespace, tablename, optype, \"primaryKey\", \"newRow\", \"oldRow\", timestamp)\n          VALUES (\n            'public',\n            'issues',\n            'INSERT',\n            json_strip_nulls(json_build_object('id', new.\"id\")),\n            jsonb_build_object('id', new.\"id\", 'title', new.\"title\"),\n            NULL,\n            NULL\n          );\n        END IF;\n\n        RETURN NEW;\n      END;\n    END;\n    $$ LANGUAGE plpgsql;",
      "CREATE TRIGGER insert_public_issues_into_oplog\n  AFTER INSERT ON \"public\".\"issues\"\n    FOR EACH ROW\n      EXECUTE FUNCTION insert_public_issues_into_oplog_function();",
      "DROP TRIGGER IF EXISTS update_public_issues_into_oplog ON \"public\".\"issues\";",
      "    CREATE OR REPLACE FUNCTION update_public_issues_into_oplog_function()\n    RETURNS TRIGGER AS $$\n    BEGIN\n      DECLARE\n        flag_value INTEGER;\n      BEGIN\n        -- Get the flag value from _electric_trigger_settings\n        SELECT flag INTO flag_value FROM \"public\"._electric_trigger_settings WHERE namespace = 'public' AND tablename = 'issues';\n\n        IF flag_value = 1 THEN\n          -- Insert into _electric_oplog\n          INSERT INTO \"public\"._electric_oplog (namespace, tablename, optype, \"primaryKey\", \"newRow\", \"oldRow\", timestamp)\n          VALUES (\n            'public',\n            'issues',\n            'UPDATE',\n            json_strip_nulls(json_build_object('id', new.\"id\")),\n            jsonb_build_object('id', new.\"id\", 'title', new.\"title\"),\n            jsonb_build_object('id', old.\"id\", 'title', old.\"title\"),\n            NULL\n          );\n        END IF;\n\n        RETURN NEW;\n      END;\n    END;\n    $$ LANGUAGE plpgsql;",
      "CREATE TRIGGER update_public_issues_into_oplog\n  AFTER UPDATE ON \"public\".\"issues\"\n    FOR EACH ROW\n      EXECUTE FUNCTION update_public_issues_into_oplog_function();",
      "DROP TRIGGER IF EXISTS delete_public_issues_into_oplog ON \"public\".\"issues\";",
      "    CREATE OR REPLACE FUNCTION delete_public_issues_into_oplog_function()\n    RETURNS TRIGGER AS $$\n    BEGIN\n      DECLARE\n        flag_value INTEGER;\n      BEGIN\n        -- Get the flag value from _electric_trigger_settings\n        SELECT flag INTO flag_value FROM \"public\"._electric_trigger_settings WHERE namespace = 'public' AND tablename = 'issues';\n\n        IF flag_value = 1 THEN\n          -- Insert into _electric_oplog\n          INSERT INTO \"public\"._electric_oplog (namespace, tablename, optype, \"primaryKey\", \"newRow\", \"oldRow\", timestamp)\n          VALUES (\n            'public',\n            'issues',\n            'DELETE',\n            json_strip_nulls(json_build_object('id', old.\"id\")),\n            NULL,\n            jsonb_build_object('id', old.\"id\", 'title', old.\"title\"),\n            NULL\n          );\n        END IF;\n\n        RETURN NEW;\n      END;\n    END;\n    $$ LANGUAGE plpgsql;",
      "CREATE TRIGGER delete_public_issues_into_oplog\n  AFTER DELETE ON \"public\".\"issues\"\n    FOR EACH ROW\n      EXECUTE FUNCTION delete_public_issues_into_oplog_function();"
    ],
    "version": "1"
  }
]