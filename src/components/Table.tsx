import * as React from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  ColumnDef,
  ColumnOrderState,
  Table,
  Header,
  HeaderGroup,
  Row,
  getSortedRowModel,
  ColumnSizingState,
  getFacetedRowModel,
  getFacetedMinMaxValues,
  getFacetedUniqueValues,
  flexRender,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TableDataType, RowDataType, TableColumn } from "cdm/FolderModel";
import StateManager from "StateManager";
import {
  DatabaseLimits,
  EMITTERS_GROUPS,
  EMITTERS_SHORTCUT,
  MetadataColumns,
  ResizeConfiguration,
} from "helpers/Constants";
import DefaultCell from "components/DefaultCell";
import DefaultHeader from "components/DefaultHeader";
import { c } from "helpers/StylesHelper";
import { HeaderNavBar } from "components/NavBar";
import TableHeader from "components/TableHeader";
import TableFooter from "components/TableFooter";
import DefaultFooter from "components/DefaultFooter";
import getInitialColumnSizing from "components/behavior/InitialColumnSizeRecord";
import customSortingfns, {
  globalDatabaseFilterFn,
} from "components/reducers/TableFilterFlavours";
import dbfolderColumnSortingFn from "components/reducers/CustomSortingFn";
import { useState, useRef, useMemo } from "react";
import {
  obsidianMdLinksOnClickCallback,
  obsidianMdLinksOnMouseOverMenuCallback,
} from "components/obsidianArq/markdownLinks";
import HeaderContextMenuWrapper from "components/contextMenu/HeaderContextMenuWrapper";
import TableActions from "components/tableActions/TableActions";
import onKeyDownArrowKeys from "./behavior/ArrowKeysNavigation";
import { Cell, flexRender as flexRenderFn } from "@tanstack/react-table";
import { Literal } from "obsidian-dataview";

const ROW_HEIGHT = 36; // estimated row height in px

const defaultColumn: Partial<ColumnDef<RowDataType>> = {
  minSize: DatabaseLimits.MIN_COLUMN_WIDTH,
  size: DatabaseLimits.DEFAULT_COLUMN_WIDTH,
  cell: DefaultCell,
  header: DefaultHeader,
  enableResizing: true,
  footer: DefaultFooter,
};

export function Table(tableData: TableDataType) {
  const { view, tableStore } = tableData;
  const columns = tableStore.columns((state) => state.columns);
  const columnActions = tableStore.columns((state) => state.actions);
  const columnsInfo = tableStore.columns((state) => state.info);
  const rows = tableStore.data((state) => state.rows);
  const rowsActions = tableStore.data((state) => state.actions);

  const cell_size_config = tableStore.configState(
    (store) => store.ddbbConfig.cell_size
  );
  const sticky_first_column_config = tableStore.configState(
    (store) => store.ddbbConfig.sticky_first_column
  );

  const globalConfig = tableStore.configState((store) => store.global);
  const configInfo = tableStore.configState((store) => store.info);
  const stateManager: StateManager = tableData.stateManager;
  const filePath = stateManager.file.path;

  const [sortBy, sortActions] = tableStore.sorting((store) => [
    store.sortBy,
    store.actions,
  ]);
  const [columnVisibility, setColumnVisibility] = useState(
    columnsInfo.getVisibilityRecord()
  );
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnSizing, setColumnSizing] = useState(
    getInitialColumnSizing(columns)
  );
  const [persistSizingTimeout, setPersistSizingTimeout] = useState(null);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(
    columnsInfo.getValueOfAllColumnsAsociatedWith("id")
  );

  const reorderColumn = (
    draggedColumnId: string,
    targetColumnId: string,
    columnOrder: string[]
  ): ColumnOrderState => {
    columnOrder.splice(
      columnOrder.indexOf(targetColumnId),
      0,
      columnOrder.splice(columnOrder.indexOf(draggedColumnId), 1)[0] as string
    );
    return [...columnOrder];
  };

  if (columnOrder.length !== columns.length) {
    setColumnOrder(columnsInfo.getValueOfAllColumnsAsociatedWith("id"));
  }

  const table: Table<RowDataType> = useReactTable({
    columns: columns.map(column => {
      if (!column.nestedKey) {
        return column;
      } else {
        const newColumn = Object.assign({}, column);
        newColumn.accessorKey = `${newColumn.accessorKey}.${newColumn.nestedKey}`;
        return newColumn;
      }
    }),
    data: rows,
    enableExpanding: true,
    getRowCanExpand: () => true,
    columnResizeMode: ResizeConfiguration.RESIZE_MODE,
    state: {
      globalFilter: globalFilter,
      columnOrder: columnOrder,
      columnSizing: columnSizing,
      sorting: sortBy,
      columnVisibility: columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: sortActions.alterSorting,
    onColumnSizingChange: (updater) => {
      const { isResizingColumn, deltaOffset, columnSizingStart } =
        table.options.state.columnSizingInfo;
      let list: ColumnSizingState = null;
      if (typeof updater === "function") {
        list = updater(columnSizing);
      } else {
        list = updater;
      }

      const columnToUpdate = columnSizingStart.find(
        (c) => c[0] === isResizingColumn
      );

      list[columnToUpdate[0]] = columnToUpdate[1] + deltaOffset;

      if (persistSizingTimeout) {
        clearTimeout(persistSizingTimeout);
      }
      setPersistSizingTimeout(
        setTimeout(() => {
          columnActions.alterColumnSize(
            columnToUpdate[0],
            columnToUpdate[1] + deltaOffset
          );
        }, 1500)
      );

      setColumnSizing(list);
    },
    onColumnOrderChange: setColumnOrder,
    getColumnCanGlobalFilter: () => true,
    globalFilterFn: globalDatabaseFilterFn(configInfo.getLocalSettings()),
    filterFns: customSortingfns,
    meta: {
      tableState: tableStore,
      view: view,
    },
    defaultColumn: {
      ...defaultColumn,
      sortingFn: dbfolderColumnSortingFn(configInfo.getLocalSettings()),
    },
    getExpandedRowModel: getExpandedRowModel(),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getFacetedMinMaxValues: getFacetedMinMaxValues(),
    debugAll:
      globalConfig.enable_debug_mode &&
      globalConfig.logger_level_info === "trace",
    autoResetPageIndex: false,
  });

  React.useEffect(() => {
    rowsActions.insertRows();
  }, []);

  // ---- Virtual scrolling ----
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const tableRows = table.getRowModel().rows;
  const totalSize = table.getTotalSize();

  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const headerGroups = table.getHeaderGroups();
  const footerGroups = table.getFooterGroups();

  return (
    <>
      <HeaderNavBar
        key={`div-header-navbar`}
        table={table}
        globalFilterRows={{
          globalFilter: globalFilter,
          setGlobalFilter: setGlobalFilter,
        }}
      />
      {/* SCROLL CONTAINER — virtualized body */}
      <div
        ref={scrollContainerRef}
        className={c("scroll-container scroll-horizontal")}
        style={{ height: "calc(100vh - 200px)", overflow: "auto" }}
      >
        {/* TABLE */}
        <div
          key={`div-table`}
          className={`${c("table noselect cell_size_" + cell_size_config + (sticky_first_column_config ? " sticky_first_column" : ""))}`}
          onMouseOver={obsidianMdLinksOnMouseOverMenuCallback(view)}
          onMouseDown={obsidianMdLinksOnClickCallback(stateManager, view, filePath)}
          onKeyDown={onKeyDownArrowKeys}
          style={{ width: totalSize }}
        >
          {/* STICKY HEADER */}
          <div key={`div-thead-sticky`} className={c(`thead sticky-top`)}
            style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--background-primary)" }}>
            {headerGroups.map((headerGroup, headerGroupIndex) => {
              const headerContext = headerGroup.headers.find(h => h.id === MetadataColumns.ROW_CONTEXT_MENU);
              const addColumnHeader = headerGroup.headers.find(h => h.id === MetadataColumns.ADD_COLUMN);
              return (
                <div key={`header-group-${headerGroup.id}-${headerGroupIndex}`} className={`${c("tr header-group")}`}>
                  <HeaderContextMenuWrapper header={headerContext} style={{ width: "30px" }} />
                  {headerGroup.headers
                    .filter(h => ![headerContext.id, addColumnHeader.id].includes(h.id))
                    .map((header: Header<RowDataType, TableColumn>, headerIndex: number) => (
                      <TableHeader key={`${header.id}-${headerIndex}`} table={table} header={header} reorderColumn={reorderColumn} headerIndex={headerIndex + 1} />
                    ))}
                  <HeaderContextMenuWrapper header={addColumnHeader} style={{ width: "45px" }} />
                </div>
              );
            })}
          </div>

          {/* VIRTUALIZED BODY */}
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = tableRows[virtualRow.index];
              return (
                <div
                  key={`virtual-row-${row.id}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <div key={`cell-tr-${row.id}`}
                    className={`${c("tr" + (row.getIsSelected() ? " row-selected" : ""))}`}
                    style={{ contentVisibility: "auto", containIntrinsicSize: "auto 32px" }}>
                    {row.getVisibleCells().map((cell: Cell<RowDataType, Literal>, cellIndex: number) => {
                      return (
                        <div
                          key={`cell-td-${cell.id}-${cellIndex}`}
                          className={`${c("td" + (cellIndex === 0 ? " row-context-menu" : ""))} data-input`}
                        >
                          {flexRenderFn(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      );
                    })}
                  </div>
                  {row.getIsExpanded() ? (
                    <div key={`expanded-cell-tr-${row.id}`} className={c("row-extend-decorator")}>
                      {/* Expanded content — simplified for virtual mode */}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* FOOTER */}
          <div key={`div-tfoot`} className={c(`tfoot`)}>
            <div className={c(`tr footer-group`)}>
              <div
                className={c(`td footer`)}
                key={`footer-add-row-button`}
                onClick={(e) => {
                  e.preventDefault();
                  view.emitter.emit(
                    EMITTERS_GROUPS.SHORTCUT,
                    EMITTERS_SHORTCUT.ADD_NEW_ROW
                  );
                }}
              >
                +
              </div>
              {Array.from(
                Array(footerGroups[0]?.headers.length - 1 || 0)
              ).map((_, index) => (
                <div
                  className={c(`td`)}
                  key={`footer-add-row-mock-td-${index}`}
                />
              ))}
            </div>
            {configInfo.getLocalSettings().enable_footer
              ? footerGroups.map((footerGroup: HeaderGroup<RowDataType>) => {
                  return (
                    <div
                      key={`footer-group-${footerGroup.id}`}
                      className={`${c("tr footer-group")}`}
                    >
                      {footerGroup.headers.map(
                        (header: Header<RowDataType, TableColumn>) => (
                          <TableFooter
                            key={`table-footer-${header.index}`}
                            table={table}
                            header={header}
                          />
                        )
                      )}
                    </div>
                  );
                })
              : null}
          </div>
        </div>
      </div>
      {/* DEBUG INFO */}
      {globalConfig.enable_show_state && (
        <pre>
          <code>{JSON.stringify(table.getState(), null, 2)}</code>
        </pre>
      )}
      {/* TABLE ACTIONS */}
      <TableActions table={table} />
    </>
  );
}
