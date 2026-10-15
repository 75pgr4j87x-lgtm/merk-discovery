import { jsPDF } from 'jspdf';
import { DiscoveryAnswers } from '../types/questionnaire';
import { cleanBriefDocument, stripMarkdownFormatting } from '../services/briefGenerator';

/**
 * Generates an official, executive-grade one-page Merakifos Project Brief PDF.
 * Uses Merakifos brand colors:
 * - Primary: Warm sage green #7C8B5F [124, 139, 95]
 * - Secondary: Deep warm olive #3F4A32 [63, 74, 50]
 * - Accent: Warm ochre #D9A441 [217, 164, 65]
 * - Neutral: Warm off white #FAF6F1 [250, 246, 241]
 */
export function exportBriefAsPdf(
  answers: DiscoveryAnswers,
  briefContent: string,
  approvedTimestamp?: string
): void {
  const brandName = answers.companyName || 'Brand';
  const cleanContent = cleanBriefDocument(briefContent, brandName);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const COLOR_SAGE = [124, 139, 95] as const;
  const COLOR_OLIVE = [63, 74, 50] as const;
  const COLOR_OCHRE = [217, 164, 65] as const;
  const COLOR_NEUTRAL = [250, 246, 241] as const;
  const COLOR_BORDER = [229, 234, 223] as const;
  const COLOR_BODY_TEXT = [63, 74, 50] as const;
  const COLOR_MUTED = [124, 139, 95] as const;

  let y = margin;

  // Background subtle tint
  doc.setFillColor(...COLOR_NEUTRAL);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Top Merakifos Brand Accent Bar (Warm Sage Green)
  doc.setFillColor(...COLOR_SAGE);
  doc.rect(margin, y, contentWidth, 2.5, 'F');
  y += 20;

  // Header Letterhead
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...COLOR_OLIVE);
  doc.text('MERAKIFOS', margin, y);

  const titleWidth = doc.getTextWidth('MERAKIFOS');
  doc.setFillColor(...COLOR_OCHRE);
  doc.circle(margin + titleWidth + 6, y - 3.5, 2.5, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_MUTED);
  doc.text('PROJECT BLUEPRINT', margin + titleWidth + 14, y);

  // Right Side: Client (Brand Name) & Date
  const dateStr = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_OLIVE);
  doc.text('CLIENT:', pageWidth - margin - 160, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR_BODY_TEXT);
  doc.text(brandName, pageWidth - margin - 116, y);

  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLOR_OLIVE);
  doc.text('Website Project Summary & Blueprint', margin, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_OLIVE);
  doc.text('DATE:', pageWidth - margin - 160, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR_BODY_TEXT);
  doc.text(dateStr, pageWidth - margin - 124, y);

  y += 16;

  // Hairline separator
  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.75);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  // Parse Sections from cleaned brief
  const sections = cleanContent.split('\n\n').filter(Boolean);

  for (const block of sections) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock || /^[-*_~=]{2,}$/.test(trimmedBlock)) continue;

    const isNumberedHeading =
      trimmedBlock.startsWith('1.') ||
      trimmedBlock.startsWith('2.') ||
      trimmedBlock.startsWith('3.') ||
      trimmedBlock.startsWith('4.') ||
      trimmedBlock.startsWith('5.') ||
      trimmedBlock.startsWith('#');

    if (isNumberedHeading) {
      const lines = trimmedBlock.split('\n');
      const headingLine = stripMarkdownFormatting(lines[0].replace(/^#+\s*/, '')).trim();
      const bodyLines = lines.slice(1);

      // Check page break safety
      if (y > pageHeight - 90) {
        doc.addPage();
        doc.setFillColor(...COLOR_NEUTRAL);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        y = margin;
      }

      // Section Header with Warm Sage Green accent pill
      doc.setFillColor(...COLOR_SAGE);
      doc.rect(margin, y - 7.5, 2.5, 10, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLOR_OLIVE);
      doc.text(headingLine.toUpperCase(), margin + 8, y);
      y += 13;

      if (bodyLines.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...COLOR_BODY_TEXT);

        for (const subLine of bodyLines) {
          const trimmedSub = subLine.trim();
          if (!trimmedSub || /^[-*_~=]{2,}$/.test(trimmedSub)) continue;

          const isBullet = trimmedSub.startsWith('•') || trimmedSub.startsWith('-') || trimmedSub.startsWith('*');
          const cleanText = stripMarkdownFormatting(trimmedSub.replace(/^[•\-\*]\s*/, '')).trim();
          const indent = isBullet ? 12 : 0;

          if (isBullet) {
            // Draw small bullet dot
            if (y > pageHeight - 50) {
              doc.addPage();
              doc.setFillColor(...COLOR_NEUTRAL);
              doc.rect(0, 0, pageWidth, pageHeight, 'F');
              y = margin;
            }
            doc.setFillColor(...COLOR_SAGE);
            doc.circle(margin + 4, y - 3, 1.5, 'F');
          }

          const wrappedLines = doc.splitTextToSize(cleanText, contentWidth - indent);
          for (const wrapped of wrappedLines) {
            if (y > pageHeight - 50) {
              doc.addPage();
              doc.setFillColor(...COLOR_NEUTRAL);
              doc.rect(0, 0, pageWidth, pageHeight, 'F');
              y = margin;
            }
            doc.text(wrapped, margin + indent, y);
            y += 11;
          }
        }
      }
      y += 7;
    } else {
      // General paragraph
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...COLOR_BODY_TEXT);

      const cleanParagraph = stripMarkdownFormatting(trimmedBlock);
      const wrappedLines = doc.splitTextToSize(cleanParagraph, contentWidth);
      for (const wrapped of wrappedLines) {
        if (y > pageHeight - 50) {
          doc.addPage();
          doc.setFillColor(...COLOR_NEUTRAL);
          doc.rect(0, 0, pageWidth, pageHeight, 'F');
          y = margin;
        }
        doc.text(wrapped, margin, y);
        y += 11;
      }
      y += 7;
    }
  }

  // Footer / Formal Electronic Sign-off
  const bottomMargin = pageHeight - margin - 16;
  if (y > bottomMargin - 26) {
    doc.addPage();
    doc.setFillColor(...COLOR_NEUTRAL);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    y = bottomMargin - 26;
  } else {
    y = Math.max(y + 8, bottomMargin - 26);
  }

  doc.setDrawColor(...COLOR_BORDER);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR_SAGE);
  doc.text('MERAKIFOS • LOOK LIKE YOU', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLOR_BODY_TEXT);
  const signOffText = approvedTimestamp
    ? `APPROVED BY ${brandName.toUpperCase()} (${approvedTimestamp})`
    : 'A SMALL, LOW RISK WAY TO START • YOUR ACCOUNTS STAY YOURS';
  doc.text(signOffText, margin + 175, y);

  doc.text('PAGE 1 OF 1', pageWidth - margin, y, { align: 'right' });

  // Download PDF file
  const companySlug = brandName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  doc.save(`${companySlug || 'merakifos'}-project-summary.pdf`);
}
