import { getTableConfig as getMysqlTableConfig } from "drizzle-orm/mysql-core";
import { getTableConfig as getSqliteTableConfig } from "drizzle-orm/sqlite-core";
import { describe, expect, test } from "vitest";
import * as mysqlSchema from "./schema.mysql.js";
import * as sqliteSchema from "./schema.sqlite.js";

type AnyConfig = ReturnType<typeof getMysqlTableConfig> | ReturnType<typeof getSqliteTableConfig>;

function normalize(config: AnyConfig) {
  return {
    columns: config.columns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      notNull: column.notNull,
      hasDefault: column.hasDefault,
      default: column.default === undefined ? null : String(column.default),
      unique: column.isUnique
    })),
    indexes: config.indexes.map((index) => index.config.name).sort(),
    foreignKeys: config.foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      const table = reference.foreignTable[Symbol.for("drizzle:Name") as keyof typeof reference.foreignTable];
      return {
        columns: reference.columns.map((column) => column.name),
        foreignTable: String(table),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
        onDelete: foreignKey.onDelete ?? "no action"
      };
    }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
  };
}

describe("SQLite/MySQL schema contract", () => {
  for (const tableName of ["forms", "formSubmissions", "shares"] as const) {
    test(`${tableName} keeps columns, defaults, indexes and foreign keys aligned`, () => {
      expect(normalize(getMysqlTableConfig(mysqlSchema[tableName])))
        .toEqual(normalize(getSqliteTableConfig(sqliteSchema[tableName])));
    });
  }

  test("maxSubmissions is a nullable integer contract", () => {
    const sqliteColumn = getSqliteTableConfig(sqliteSchema.forms).columns.find((column) => column.name === "max_submissions");
    const mysqlColumn = getMysqlTableConfig(mysqlSchema.forms).columns.find((column) => column.name === "max_submissions");
    expect(sqliteColumn).toMatchObject({ dataType: "number", notNull: false });
    expect(mysqlColumn).toMatchObject({ dataType: "number", notNull: false });
  });
});
