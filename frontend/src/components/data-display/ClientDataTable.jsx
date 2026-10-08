import { useState } from 'react';
import DataTableViewport, { QUERY_TABLE_PAGE_SIZE } from './DataTableViewport';
import PaginationControls from './PaginationControls';

/** Paginate the current chart's records without dropping rows from its data model. */
export default function ClientDataTable({ rows, renderRow, children, ariaLabel, footer = null }) {
  const [selection, setSelection] = useState({ rows, page: 1 });
  const pageCount = Math.max(1, Math.ceil(rows.length / QUERY_TABLE_PAGE_SIZE));
  const page = selection.rows === rows ? Math.min(selection.page, pageCount) : 1;
  const offset = (page - 1) * QUERY_TABLE_PAGE_SIZE;
  return (
    <DataTableViewport
      ariaLabel={ariaLabel}
      footer={footer}
      resizable
      pageKey={page}
      pagination={<PaginationControls
        page={page}
        pageCount={pageCount}
        onPageChange={next => setSelection({ rows, page: next })}
        ariaLabel={`${ariaLabel}分页`}
      />}
    >
      {children}
      <tbody>{rows.slice(offset, offset + QUERY_TABLE_PAGE_SIZE).map((row, index) => renderRow(row, offset + index))}</tbody>
    </DataTableViewport>
  );
}
