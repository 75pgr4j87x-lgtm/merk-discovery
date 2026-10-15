import { jsPDF } from 'jspdf';

export interface ClientInvoice {
  companyName: string;
  clientName: string;
  clientEmail: string;
  projectTitle: string;
  brandColors: string[];
  invoiceNumber: string;
  invoiceDueDate: string;
  currency: string;
  projectCharge: number;
  discountPercent: number;
  invoiceNotes: string;
  tasks: Array<{ title: string; description: string; dueDate: string; amount: number }>;
}

const hexToRgb = (value: string): [number, number, number] => {
  const hex = value.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) return [63, 74, 50];
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
};

const formatMoney = (amount: number, currency: string) => new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 2,
}).format(Number.isFinite(amount) ? amount : 0);

export function downloadClientInvoicePdf(invoice: ClientInvoice): void {
  const document = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  const primary = hexToRgb(invoice.brandColors?.[0] || '#3F4A32');
  const olive: [number, number, number] = [63, 74, 50];
  const sage: [number, number, number] = [124, 139, 95];
  const ochre: [number, number, number] = [217, 164, 65];
  const border: [number, number, number] = [229, 234, 223];
  let y = 46;

  document.setFillColor(250, 246, 241);
  document.rect(0, 0, pageWidth, pageHeight, 'F');
  document.setFillColor(...primary);
  document.roundedRect(margin, y, contentWidth, 4, 2, 2, 'F');
  y += 28;

  document.setFont('helvetica', 'bold');
  document.setFontSize(12);
  document.setTextColor(...olive);
  document.text('MERAKIFOS', margin, y);
  const brandTextWidth = document.getTextWidth('MERAKIFOS');
  document.setFillColor(...ochre);
  document.circle(margin + brandTextWidth + 7, y - 4, 2.5, 'F');
  document.setFont('helvetica', 'normal');
  document.setFontSize(8);
  document.setTextColor(...sage);
  document.text('STUDIO', margin + brandTextWidth + 15, y);

  y += 34;
  document.setFont('helvetica', 'bold');
  document.setFontSize(25);
  document.setTextColor(...primary);
  document.text('INVOICE', margin, y);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(...olive);
  document.text(`Invoice ${invoice.invoiceNumber || ''}`, pageWidth - margin, y - 9, { align: 'right' });
  document.text(`Issued ${new Date().toLocaleDateString()}`, pageWidth - margin, y + 7, { align: 'right' });

  y += 28;
  document.setDrawColor(...border);
  document.line(margin, y, pageWidth - margin, y);
  y += 24;

  document.setFont('helvetica', 'bold');
  document.setFontSize(8);
  document.setTextColor(...sage);
  document.text('BILL TO', margin, y);
  y += 15;
  document.setFont('helvetica', 'bold');
  document.setFontSize(11);
  document.setTextColor(...olive);
  document.text(invoice.companyName || invoice.clientName || 'Client', margin, y);
  y += 14;
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  if (invoice.clientName) {
    document.text(invoice.clientName, margin, y);
    y += 13;
  }
  if (invoice.clientEmail) {
    document.text(invoice.clientEmail, margin, y);
    y += 13;
  }
  if (invoice.invoiceDueDate) {
    document.setFont('helvetica', 'bold');
    document.text(`Due date: ${invoice.invoiceDueDate}`, pageWidth - margin, y - 26, { align: 'right' });
  }

  y += 18;
  document.setFont('helvetica', 'bold');
  document.setFontSize(14);
  document.setTextColor(...olive);
  document.text(invoice.projectTitle || 'Project', margin, y);
  y += 22;

  const descriptionX = margin;
  const dateX = pageWidth - margin - 115;
  const amountX = pageWidth - margin;
  const drawTableHeader = () => {
    document.setFillColor(241, 242, 236);
    document.roundedRect(margin, y - 12, contentWidth, 23, 4, 4, 'F');
    document.setFont('helvetica', 'bold');
    document.setFontSize(8);
    document.setTextColor(...olive);
    document.text('PROJECT WORK', descriptionX + 8, y + 2);
    document.text('TARGET', dateX, y + 2);
    document.text('AMOUNT', amountX - 8, y + 2, { align: 'right' });
    y += 25;
  };
  drawTableHeader();

  for (const task of invoice.tasks || []) {
    const titleLines = document.splitTextToSize(task.title || 'Project task', 265) as string[];
    const descriptionLines = task.description
      ? document.splitTextToSize(task.description, 265) as string[]
      : [];
    const rowHeight = Math.max(35, titleLines.length * 12 + descriptionLines.length * 10 + 14);
    if (y + rowHeight > pageHeight - 150) {
      document.addPage();
      document.setFillColor(250, 246, 241);
      document.rect(0, 0, pageWidth, pageHeight, 'F');
      y = 48;
      drawTableHeader();
    }

    document.setFont('helvetica', 'bold');
    document.setFontSize(9);
    document.setTextColor(...olive);
    document.text(titleLines, descriptionX + 8, y);
    let detailY = y + titleLines.length * 12;
    if (descriptionLines.length) {
      document.setFont('helvetica', 'normal');
      document.setFontSize(8);
      document.setTextColor(89, 100, 91);
      document.text(descriptionLines, descriptionX + 8, detailY);
      detailY += descriptionLines.length * 10;
    }
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(89, 100, 91);
    document.text(task.dueDate || '-', dateX, y);
    document.setFontSize(9);
    document.setTextColor(...olive);
    document.text(formatMoney(task.amount, invoice.currency), amountX - 8, y, { align: 'right' });
    y = Math.max(detailY, y + 20) + 10;
    document.setDrawColor(...border);
    document.line(margin, y - 4, pageWidth - margin, y - 4);
  }

  const total = Number(invoice.projectCharge) || 0;
  const discountPercent = Math.max(0, Math.min(100, Number(invoice.discountPercent) || 0));
  const discount = total * discountPercent / 100;
  const discountedSubtotal = total - discount;
  const miscellaneous = discountedSubtotal * 0.1;
  const totalsX = pageWidth - margin - 190;
  const totalsValueX = pageWidth - margin - 8;
  y += 12;
  const addTotalRow = (label: string, amount: number, bold = false) => {
    document.setFont('helvetica', bold ? 'bold' : 'normal');
    document.setFontSize(bold ? 11 : 9);
    document.setTextColor(...olive);
    document.text(label, totalsX, y);
    document.text(formatMoney(amount, invoice.currency), totalsValueX, y, { align: 'right' });
    y += bold ? 22 : 16;
  };
  addTotalRow('Project fee', total);
  if (discountPercent > 0) addTotalRow(`Discount (${discountPercent}%)`, -discount);
  addTotalRow('Project subtotal', discountedSubtotal);
  addTotalRow('Miscellaneous (10%)', miscellaneous);
  document.setDrawColor(...primary);
  document.setLineWidth(1.5);
  document.line(totalsX, y - 7, totalsValueX, y - 7);
  y += 7;
  addTotalRow('Total due', discountedSubtotal + miscellaneous, true);

  if (invoice.invoiceNotes) {
    const noteLines = document.splitTextToSize(invoice.invoiceNotes, contentWidth) as string[];
    y += 18;
    if (y + noteLines.length * 12 > pageHeight - 75) {
      document.addPage();
      document.setFillColor(250, 246, 241);
      document.rect(0, 0, pageWidth, pageHeight, 'F');
      y = 50;
    }
    document.setFont('helvetica', 'bold');
    document.setFontSize(9);
    document.setTextColor(...olive);
    document.text('NOTES', margin, y);
    y += 14;
    document.setFont('helvetica', 'normal');
    document.setFontSize(8.5);
    document.text(noteLines, margin, y);
  }

  const footerY = pageHeight - 38;
  document.setDrawColor(...border);
  document.setLineWidth(0.5);
  document.line(margin, footerY - 12, pageWidth - margin, footerY - 12);
  document.setFont('helvetica', 'normal');
  document.setFontSize(7.5);
  document.setTextColor(...sage);
  document.text('MERAKIFOS STUDIO · THOUGHTFUL WORK, MADE WITH CARE', margin, footerY);
  document.setTextColor(...olive);
  document.text('Taxes are not calculated. Confirm applicable tax requirements for your jurisdiction.', pageWidth - margin, footerY, { align: 'right' });

  const slug = (invoice.companyName || invoice.clientName || 'client')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'client';
  const invoiceNumber = (invoice.invoiceNumber || 'invoice').replace(/[^a-z0-9-]+/gi, '-');
  document.save(`${slug}-${invoiceNumber}.pdf`);
}
