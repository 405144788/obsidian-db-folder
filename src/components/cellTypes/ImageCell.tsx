import React from "react";
import { TFile } from "obsidian";
import { TableColumn } from "cdm/FolderModel";
import { CellComponentProps } from "cdm/ComponentsModel";
import { ParseService } from "services/ParseService";
import { InputType } from "helpers/Constants";

function ImageCell(props: CellComponentProps) {
  const { defaultCell } = props;
  const { row, column, table } = defaultCell;
  const { tableState } = table.options.meta;
  const tableColumn = column.columnDef as TableColumn;
  const configInfo = tableState.configState((state) => state.info);
  const view = table.options.meta.view;

  const cellValue = tableState.data(
    (state) =>
      ParseService.parseRowToCell(
        state.rows[row.index],
        tableColumn,
        InputType.TEXT,
        configInfo.getLocalSettings()
      ) as string
  );

  if (!cellValue) {
    return <span style={{ color: "var(--text-faint)", fontSize: "12px" }}>无图片</span>;
  }

  const file = view.app.vault.getAbstractFileByPath(cellValue);
  if (file instanceof TFile) {
    const src = view.app.vault.getResourcePath(file);
    return (
      <img
        src={src}
        alt=""
        style={{
          width: "60px",
          height: "60px",
          objectFit: "cover",
          borderRadius: "4px",
        }}
        loading="lazy"
      />
    );
  }

  return <span style={{ color: "var(--text-error)", fontSize: "12px" }}>路径无效</span>;
}

export default ImageCell;
