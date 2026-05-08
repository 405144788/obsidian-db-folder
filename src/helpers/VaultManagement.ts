import { RowDataType, NormalizedPath, TableColumn } from 'cdm/FolderModel';
import { Notice, TFile, parseYaml, TAbstractFile } from 'obsidian';
import { LOGGER } from "services/Logger";
import NoteInfo from 'services/NoteInfo';
import { RowCacheService } from 'services/RowCacheService';
import { DatabaseCore, SourceDataTypes, MetadataColumns } from "helpers/Constants";
import { generateDataviewTableQuery } from 'helpers/QueryHelper';
import { DataviewService } from 'services/DataviewService';
import { Literal } from 'obsidian-dataview/lib/data-model/value';
import { DataArray } from 'obsidian-dataview/lib/api/data-array';
import { LocalSettings } from 'cdm/SettingsModel';
import { NoteInfoPage } from 'cdm/DatabaseModel';
import { tableFilter } from '@features/filters';
import { FilterSettings } from '@features/filters/model/FiltersModel';


const noBreakSpace = / /g;

/**
 * Check if content has frontmatter
 * @param data
 * @returns
 */
export function hasFrontmatter(data: string): boolean {
  if (!data) return false;

  const frontmatterRegex = /^---[\s\S]+?---/g;
  return frontmatterRegex.test(data);
}

/** Check if file is a database note */
export function isDatabaseNote(data: string | TFile) {
  if (data instanceof TFile) {
    if (!data) return false;

    const cache = app.metadataCache.getFileCache(data);

    return !!cache?.frontmatter && !!cache?.frontmatter[DatabaseCore.FRONTMATTER_KEY];
  } else {
    const match = data.match(/---\s+([\w\W]+?)\s+---/);

    if (!match) {
      return false;
    }

    if (!match[1].contains(DatabaseCore.FRONTMATTER_KEY)) {
      return false;
    }

    return true;
  }
}

export function getNormalizedPath(path: string): NormalizedPath {
  const stripped = path.replaceAll("[", "").replaceAll("]", "").replace(noBreakSpace, ' ').normalize('NFC');

  // split on first occurance of '|'
  // "root#subpath##subsubpath|alias with |# chars"
  //             0            ^        1
  const splitOnAlias = stripped.split(/\|(.*)/);

  // split on first occurance of '#' (in substring)
  // "root#subpath##subsubpath"
  //   0  ^        1
  const splitOnHash = splitOnAlias[0].split(/#(.*)/);

  return {
    root: splitOnHash[0],
    subpath: splitOnHash[1] ? '#' + splitOnHash[1] : '',
    alias: splitOnAlias[1] || '',
  };
}

/**
 * Fast path: bypass Dataview for folder-based sources.
 * Uses parallel vault.read() + parseYaml() for much faster initial load.
 * No setTimeout between batches — data load completes in one synchronous block after parallel I/O.
 */
async function adapterFolderFast(dbFile: TFile, columns: TableColumn[], ddbbConfig: LocalSettings, filters: FilterSettings, folderPath: string, includeSubfolders: boolean): Promise<Array<RowDataType>> {
  RowCacheService.init(dbFile.path);
  const rows: Array<RowDataType> = [];

  // Get files directly from vault
  const allFiles = app.vault.getFiles();
  const targetFiles = allFiles.filter(f => {
    if (f.path === dbFile.path) return false;
    if (includeSubfolders) {
      return f.path.startsWith(folderPath + "/") || f.path === folderPath;
    }
    return f.parent?.path === folderPath;
  });

  if (targetFiles.length === 0) return rows;

  // Read ALL files in one parallel burst (no batching needed for ~850 files)
  const rawContents = await Promise.all(
    targetFiles.map(f => app.vault.read(f).catch(() => ""))
  );

  // Process inline — no setTimeout yield
  for (let j = 0; j < targetFiles.length; j++) {
    const file = targetFiles[j];
    const raw = rawContents[j];
    const mtime = file.stat.mtime;

    // Check cache
    const cached = RowCacheService.get(file.path, mtime);
    if (cached) {
      rows.push(cached);
      continue;
    }

    // Parse frontmatter directly
    let fm: Record<string, any> = {};
    if (raw.startsWith("---")) {
      const end = raw.indexOf("---", 4);
      if (end > 0) {
        const fmRaw = raw.substring(4, end);
        try { fm = parseYaml(fmRaw) || {}; } catch { fm = {}; }
      }
    }

    // Build RowDataType
    const row: RowDataType = {
      __note__: undefined,
      [MetadataColumns.FILE]: app.metadataCache.fileToLinktext(file, file.path, false),
      [MetadataColumns.CREATED]: file.stat.ctime,
      [MetadataColumns.MODIFIED]: mtime,
      [MetadataColumns.TASKS]: [],
      [MetadataColumns.OUTLINKS]: [],
      [MetadataColumns.INLINKS]: [],
      [MetadataColumns.TAGS]: [],
    };

    // Map column keys from frontmatter
    for (const col of columns) {
      if (fm[col.key] !== undefined) {
        row[col.key] = fm[col.key];
      }
    }

    RowCacheService.set(file.path, mtime, row);
    rows.push(row);
  }

  return rows;
}

export async function adapterTFilesToRows(dbFile: TFile, columns: TableColumn[], ddbbConfig: LocalSettings, filters: FilterSettings): Promise<Array<RowDataType>> {
  const folderPath = dbFile.parent.path;

  // Fast path for folder-based sources (bypass Dataview)
  if (ddbbConfig.source_data === SourceDataTypes.SPECIFIED_FOLDER) {
    const targetPath = ddbbConfig.source_destination_path || folderPath;
    return adapterFolderFast(dbFile, columns, ddbbConfig, filters, targetPath, true);
  }
  if (ddbbConfig.source_data === SourceDataTypes.CURRENT_FOLDER) {
    return adapterFolderFast(dbFile, columns, ddbbConfig, filters, folderPath, true);
  }
  if (ddbbConfig.source_data === SourceDataTypes.CURRENT_FOLDER_WITHOUT_SUBFOLDERS) {
    return adapterFolderFast(dbFile, columns, ddbbConfig, filters, folderPath, false);
  }
  LOGGER.debug(`=> adapterTFilesToRows (Dataview fallback).  folderPath:${folderPath}`);
  const rows: Array<RowDataType> = [];

  // Init cache for this database
  RowCacheService.init(dbFile.path);

  let folderFiles = await sourceDataviewPages(ddbbConfig, folderPath, columns);
  folderFiles = folderFiles.where((p: NoteInfoPage) => p.file.path !== dbFile.path);
  // Config filters asociated with the database
  if (filters.enabled && filters.conditions.length > 0) {
    folderFiles = folderFiles.where(p => tableFilter(filters.conditions, p, ddbbConfig));
  }

  const pagesArray = folderFiles.values as NoteInfoPage[];
  const cachedRows = new Map<NoteInfoPage, RowDataType>();
  const uncachedPages: NoteInfoPage[] = [];

  // Check cache first
  for (const page of pagesArray) {
    const mtime = page.file.mtime?.valueOf() ?? 0;
    const cached = RowCacheService.get(page.file.path, mtime);
    if (cached) {
      cachedRows.set(page, cached);
    } else {
      uncachedPages.push(page);
    }
  }

  // Process uncached in one parallel burst
  if (uncachedPages.length > 0) {
    const fileContents = await Promise.all(
      uncachedPages.map(page => app.vault.read(page.file.path).catch(() => ""))
    );
    // Parse inline — no setTimeout yield
    for (let j = 0; j < uncachedPages.length; j++) {
      const page = uncachedPages[j];
      const noteInfo = new NoteInfo(page);
      const rowData = noteInfo.getRowDataType(columns);
      const mtime = page.file.mtime?.valueOf() ?? 0;
      RowCacheService.set(page.file.path, mtime, rowData);
      cachedRows.set(page, rowData);
    }
  }

  // Assemble final rows (preserving original order)
  for (const page of pagesArray) {
    const row = cachedRows.get(page);
    if (row) rows.push(row);
  }

  LOGGER.debug(`<= adapterTFilesToRows.  number of rows:${rows.length} (cached: ${pagesArray.length - uncachedPages.length}, parsed: ${uncachedPages.length})`);
  return rows;
}

export async function obtainAllPossibleRows(folderPath: string, ddbbConfig: LocalSettings, filters: FilterSettings, columns: TableColumn[]): Promise<Array<RowDataType>> {
  LOGGER.debug(`=> obtainAllPossibleRows.  folderPath:${folderPath}`);
  const rows: Array<RowDataType> = [];
  let folderFiles = await sourceDataviewPages(ddbbConfig, folderPath, columns);
  // Config filters asociated with the database
  if (filters.enabled && filters.conditions.length > 0) {
    folderFiles = folderFiles.where(p => tableFilter(filters.conditions, p, ddbbConfig));
  }
  folderFiles.map((page: NoteInfoPage) => {
    const noteInfo = new NoteInfo(page);
    rows.push(noteInfo.getAllRowDataType());
  });

  LOGGER.debug(`<= obtainAllPossibleRows.  number of rows:${rows.length}`);
  return rows;
}

export async function sourceDataviewPages(ddbbConfig: LocalSettings, folderPath: string, columns?: TableColumn[]): Promise<DataArray<Record<string, Literal>>> {
  let pagesResult: DataArray<Record<string, Literal>>;
  try {
    switch (ddbbConfig.source_data) {
      case SourceDataTypes.TAG:
        pagesResult = obtainPagesResult(`${ddbbConfig.source_form_result.split(',').join(' OR ')}`);
        break;
      case SourceDataTypes.INCOMING_LINK:
        pagesResult = obtainPagesResult(`[[${ddbbConfig.source_form_result}]]`);
        break;
      case SourceDataTypes.OUTGOING_LINK:
        pagesResult = obtainPagesResult(`outgoing([[${ddbbConfig.source_form_result}]])`);
        break;
      case SourceDataTypes.QUERY_JS:
        pagesResult = obtainPagesResult(ddbbConfig.source_form_result);
        break;
      case SourceDataTypes.QUERY:
        pagesResult = await obtainQueryResult(
          generateDataviewTableQuery(
            columns,
            ddbbConfig.source_form_result)
        );
        break;

      case SourceDataTypes.CURRENT_FOLDER_WITHOUT_SUBFOLDERS:
        if (!folderPath || folderPath === '/') {
          pagesResult = DataviewService.getDataviewAPI().pages()
            .where((p: NoteInfoPage) => !p.file.folder);
        } else {
          pagesResult = DataviewService.getDataviewAPI().pages(`"${folderPath}"`)
            .where((p: NoteInfoPage) => p.file.folder === folderPath);
        }
        break;
      case SourceDataTypes.SPECIFIED_FOLDER:
        {
          const targetPath = ddbbConfig.source_destination_path || '';
          pagesResult = DataviewService.getDataviewAPI().pages(`"${targetPath}"`);
        }
        break;
      default:
        pagesResult = DataviewService.getDataviewAPI().pages(`"${folderPath}"`);
    }
  } catch (error) {
    const msg = `Error obtaining pages result. Current folder loaded instead`;
    LOGGER.error(msg, error);
    new Notice(msg, 4000);
    pagesResult = DataviewService.getDataviewAPI().pages(`"${folderPath}"`);
  }
  return pagesResult;
}

function obtainPagesResult(pageQuery: string): DataArray<Record<string, Literal>> {
  return DataviewService.getDataviewAPI().pages(pageQuery);
}

async function obtainQueryResult(query: string): Promise<DataArray<Record<string, Literal>>> {
  const result = await DataviewService.getDataviewAPI().query(query);
  if (!result.successful || result.value.type !== 'table') {
    throw new Error(`Query ${query} failed`);
  }
  const arrayRecord: Record<string, Literal>[] = [];
  const headers = result.value.headers;
  result.value.values.forEach((row: any) => {
    const recordResult: Record<string, Literal> = {};
    headers.forEach((header: any, index: any) => {
      recordResult[header] = row[index];
    })
    arrayRecord.push(recordResult);
  });
  return DataviewService.getDataviewAPI().array(arrayRecord);
}

export function obtainCellFromFile(path: string, column: TableColumn): Literal {
  const page = DataviewService.getDataviewAPI().page(path) as NoteInfoPage;
  const noteInfo = new NoteInfo(page);
  const uniqueRowValue = noteInfo.getRowDataType([column]);
  return uniqueRowValue[column.id] as Literal;
}
