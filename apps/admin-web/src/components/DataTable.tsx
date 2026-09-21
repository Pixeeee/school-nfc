
import type { ReactNode } from "react";
import { Empty, Loading } from "./Ui";
export interface Column<T> { key: string; header: string; render: (row: T) => ReactNode; className?: string; }
export function DataTable<T extends { id: string }>({ rows, columns, loading, emptyTitle = "Nothing here yet" }: { rows: T[]; columns: Column<T>[]; loading?: boolean; emptyTitle?: string }) {
  if (loading) return <Loading />;
  if (!rows.length) return <Empty title={emptyTitle} description="Records will appear here after they are created." />;
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key} className={column.className}>{column.header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column.key} className={column.className} data-label={column.header}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>;
}
