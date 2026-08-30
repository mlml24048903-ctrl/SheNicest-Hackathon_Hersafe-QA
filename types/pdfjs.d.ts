// pdfjs-dist legacy 子路径无类型声明，这里给出用到的最小类型面
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export interface PdfTextItem {
    str?: string;
  }
  export interface PdfPage {
    getTextContent(): Promise<{ items: PdfTextItem[] }>;
  }
  export interface PdfDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPage>;
  }
  export function getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocument> };
}
