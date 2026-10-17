/**
 * Turns the on-screen bill into an A4 PDF by photographing the rendered
 * BillPreview, so the PDF is exactly what Print produces — there is no second
 * copy of the invoice layout to keep in step with the first.
 *
 * html2canvas-pro rather than html2canvas: Tailwind v4 emits oklch() colours,
 * which the original cannot parse (it throws on the first slate-* class).
 *
 * Both libraries are imported on first use, not at module load: together they
 * are ~500KB, and most visits to a bill never share it.
 */

/** Width of the captured node in CSS px — fixes the layout so a phone-width
 * screen still produces a full-width A4 page rather than a squeezed one. */
const CAPTURE_WIDTH = 820;

export async function billNodeToPdfBlob(node: HTMLElement): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);

  const canvas = await html2canvas(node, {
    // 2x keeps small print legible without making the file enormous.
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    windowWidth: CAPTURE_WIDTH,
    width: CAPTURE_WIDTH,
  });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageHeight = (canvas.height * pageWidth) / canvas.width;
  // JPEG at 0.92 keeps a multi-page bill well under WhatsApp's attachment limit;
  // PNG of the same page runs several times larger for no visible gain.
  const image = canvas.toDataURL("image/jpeg", 0.92);

  let offset = 0;
  let remaining = imageHeight;
  pdf.addImage(image, "JPEG", 0, offset, pageWidth, imageHeight);
  remaining -= pageHeight;
  while (remaining > 0) {
    offset -= pageHeight;
    pdf.addPage();
    pdf.addImage(image, "JPEG", 0, offset, pageWidth, imageHeight);
    remaining -= pageHeight;
  }

  return pdf.output("blob");
}

/** A filename safe on every platform: "Bill-NG-0059.pdf". Every run of
 * punctuation collapses to one dash — dots included, so a bill number can
 * never contribute a ".." segment or a second extension. */
export function billPdfFilename(billNumber: string): string {
  const safe = billNumber.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "bill";
  return `Bill-${safe}.pdf`;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Digits only, with India's country code when the number is a bare 10-digit
 * mobile — wa.me rejects anything else. Returns "" when there is nothing usable. */
export function waNumber(mobile: string | null | undefined): string {
  const digits = (mobile ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length > 10 && digits.length <= 15) return digits;
  return "";
}
