export default [
  {
    "statements": [
      "CREATE TABLE \"issues\" (\n  \"id\" TEXT NOT NULL,\n  \"title\" TEXT NOT NULL,\n  CONSTRAINT \"issues_pkey\" PRIMARY KEY (\"id\")\n) WITHOUT ROWID;\n",
      "INSERT OR IGNORE INTO _electric_trigger_settings (namespace, tablename, flag) VALUES ('main', 'issues', 1);",
      "DROP TRIGGER IF EXISTS update_ensure_main_issues_primarykey;",
      "CREATE TRIGGER update_ensure_main_issues_primarykey\n  BEFORE UPDATE ON \"main\".\"issues\"\nBEGIN\n  SELECT\n    CASE\n      WHEN old.\"id\" != new.\"id\" THEN\n      \t\tRAISE (ABORT, 'cannot change the value of column id as it belongs to the primary key')\n    END;\nEND;",
      "DROP TRIGGER IF EXISTS insert_main_issues_into_oplog;",
      "CREATE TRIGGER insert_main_issues_into_oplog\n   AFTER INSERT ON \"main\".\"issues\"\n   WHEN 1 = (SELECT flag from _electric_trigger_settings WHERE namespace = 'main' AND tablename = 'issues')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'issues', 'INSERT', json_patch('{}', json_object('id', new.\"id\")), json_object('id', new.\"id\", 'title', new.\"title\"), NULL, NULL);\nEND;",
      "DROP TRIGGER IF EXISTS update_main_issues_into_oplog;",
      "CREATE TRIGGER update_main_issues_into_oplog\n   AFTER UPDATE ON \"main\".\"issues\"\n   WHEN 1 = (SELECT flag from _electric_trigger_settings WHERE namespace = 'main' AND tablename = 'issues')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'issues', 'UPDATE', json_patch('{}', json_object('id', new.\"id\")), json_object('id', new.\"id\", 'title', new.\"title\"), json_object('id', old.\"id\", 'title', old.\"title\"), NULL);\nEND;",
      "DROP TRIGGER IF EXISTS delete_main_issues_into_oplog;",
      "CREATE TRIGGER delete_main_issues_into_oplog\n   AFTER DELETE ON \"main\".\"issues\"\n   WHEN 1 = (SELECT flag from _electric_trigger_settings WHERE namespace = 'main' AND tablename = 'issues')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'issues', 'DELETE', json_patch('{}', json_object('id', old.\"id\")), NULL, json_object('id', old.\"id\", 'title', old.\"title\"), NULL);\nEND;"
    ],
    "version": "1"
  },
  {
    "statements": [
      "CREATE TABLE \"foo\" (\n  \"id\" TEXT NOT NULL,\n  \"title\" TEXT NOT NULL,\n  CONSTRAINT \"foo_pkey\" PRIMARY KEY (\"id\")\n) WITHOUT ROWID;\n",
      "INSERT OR IGNORE INTO _electric_trigger_settings (namespace, tablename, flag) VALUES ('main', 'foo', 1);",
      "DROP TRIGGER IF EXISTS update_ensure_main_foo_primarykey;",
      "CREATE TRIGGER update_ensure_main_foo_primarykey\n  BEFORE UPDATE ON \"main\".\"foo\"\nBEGIN\n  SELECT\n    CASE\n      WHEN old.\"id\" != new.\"id\" THEN\n      \t\tRAISE (ABORT, 'cannot change the value of column id as it belongs to the primary key')\n    END;\nEND;",
      "DROP TRIGGER IF EXISTS insert_main_foo_into_oplog;",
      "CREATE TRIGGER insert_main_foo_into_oplog\n   AFTER INSERT ON \"main\".\"foo\"\n   WHEN 1 = (SELECT flag from _electric_trigger_settings WHERE namespace = 'main' AND tablename = 'foo')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'foo', 'INSERT', json_patch('{}', json_object('id', new.\"id\")), json_object('id', new.\"id\", 'title', new.\"title\"), NULL, NULL);\nEND;",
      "DROP TRIGGER IF EXISTS update_main_foo_into_oplog;",
      "CREATE TRIGGER update_main_foo_into_oplog\n   AFTER UPDATE ON \"main\".\"foo\"\n   WHEN 1 = (SELECT flag from _electric_trigger_settings WHERE namespace = 'main' AND tablename = 'foo')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'foo', 'UPDATE', json_patch('{}', json_object('id', new.\"id\")), json_object('id', new.\"id\", 'title', new.\"title\"), json_object('id', old.\"id\", 'title', old.\"title\"), NULL);\nEND;",
      "DROP TRIGGER IF EXISTS delete_main_foo_into_oplog;",
      "CREATE TRIGGER delete_main_foo_into_oplog\n   AFTER DELETE ON \"main\".\"foo\"\n   WHEN 1 = (SELECT flag from _electric_trigger_settings WHERE namespace = 'main' AND tablename = 'foo')\nBEGIN\n  INSERT INTO _electric_oplog (namespace, tablename, optype, primaryKey, newRow, oldRow, timestamp)\n  VALUES ('main', 'foo', 'DELETE', json_patch('{}', json_object('id', old.\"id\")), NULL, json_object('id', old.\"id\", 'title', old.\"title\"), NULL);\nEND;"
    ],
    "version": "2"
  }
]