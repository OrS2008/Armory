/** Hands the browser a file to save. */
export function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // Revoking immediately is safe: the click has already started the download.
  URL.revokeObjectURL(url);
}

/** UTF-8 BOM first, or Excel reads a Hebrew CSV as mojibake. */
export function downloadCsv(fileName: string, csv: string): void {
  downloadBlob(fileName, new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
}
