"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// One column definition for the shared DataTable.
//  - header: the column label (rendered darker + medium-weight by the primitive).
//  - align:  text alignment; numbers/marks usually "center" or "right".
//  - width:  fixed px/CSS width so the same column lines up across every table.
//  - tabular: line up digits with tabular-nums.
//  - cell:   render the value for a row. Cells are muted by default; pass a pill
//            or a `className` when a cell needs its own colour.
export type Column<T> = {
  key: string;
  header: React.ReactNode;
  align?: "left" | "center" | "right";
  width?: number | string;
  tabular?: boolean;
  /** Darken this column (foreground) instead of the muted default — reliable, unlike overriding via className. */
  emphasis?: boolean;
  className?: string;
  cell: (row: T, index: number) => React.ReactNode;
};

const alignClass = (a?: "left" | "center" | "right") =>
  a === "center" ? "text-center" : a === "right" ? "text-right" : "";

// System-wide table look: darker medium-weight header, muted record cells
// (never bold/black), consistent alignment, and a shared empty state. Pages
// supply columns + rows; the styling stays identical everywhere.
export function DataTable<T>({
  columns, rows, rowKey, empty = "No data yet.", className, indexed = false, loading = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => React.Key;
  empty?: React.ReactNode;
  className?: string;
  /** Prepend a shared, auto-numbered "#" column (row index). */
  indexed?: boolean;
  /** While true, show a quiet loading row instead of the empty message. */
  loading?: boolean;
}) {
  // A single place that defines the "#" column so every indexed table matches.
  const allColumns: Column<T>[] = indexed
    ? [{ key: "__index", header: "#", width: 44, tabular: true, cell: (_row, i) => i + 1 }, ...columns]
    : columns;
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {allColumns.map((col) => (
            <TableHead
              key={col.key}
              style={col.width ? { width: col.width } : undefined}
              className={cn("first:pl-5 last:pr-5", alignClass(col.align), col.tabular && "tabular-nums")}
            >
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={rowKey(row, i)}>
            {allColumns.map((col) => (
              <TableCell
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(col.emphasis ? "text-foreground" : "text-muted-foreground", "first:pl-5 last:pr-5", alignClass(col.align), col.tabular && "tabular-nums", col.className)}
              >
                {col.cell(row, i)}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={allColumns.length} className="py-10 text-center text-muted-foreground">
              {loading ? "Loading…" : empty}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
