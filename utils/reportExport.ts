export type ReportExportFormat = 'csv' | 'json' | 'txt' | 'html' | 'pdf' | 'print';

export type ReportMetricItem = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: string;
};

export type ReportTableColumn = {
  key: string;
  label: string;
};

export type ReportMetricsSection = {
  type: 'metrics';
  title: string;
  description?: string;
  items: ReportMetricItem[];
};

export type ReportTableSection = {
  type: 'table';
  title: string;
  description?: string;
  columns: ReportTableColumn[];
  rows: Array<Record<string, string | number | null>>;
};

export type ReportSection = ReportMetricsSection | ReportTableSection;

export type ReportPayload = {
  report_key: string;
  title: string;
  description: string;
  generated_at: string;
  filters?: {
    date_from?: string | null;
    date_to?: string | null;
    branch_id?: number | null;
    branch_label?: string | null;
    scope_note?: string | null;
    role?: string | null;
  };
  sections: ReportSection[];
};

export type ReportDefinition = {
  key: string;
  title: string;
  description: string;
};

function escapeCsv(value: unknown) {
  const stringValue = String(value ?? '');
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeFileSegment(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function resolveReportFileBaseName(report: ReportPayload) {
  const reportPart = normalizeFileSegment(report.report_key || report.title || 'report');
  const branchPart = normalizeFileSegment(report.filters?.branch_label || 'all-branches');
  const dateFrom = normalizeFileSegment(report.filters?.date_from || 'all-time');
  const dateTo = normalizeFileSegment(report.filters?.date_to || 'all-time');
  return `${reportPart}_${branchPart}_${dateFrom}_${dateTo}`.replace(/-+/g, '-');
}

function resolveCollectionFileBaseName(reports: ReportPayload[]) {
  if (reports.length === 0) return 'all_reports';
  const first = reports[0];
  const branchPart = normalizeFileSegment(first.filters?.branch_label || 'all-branches');
  const dateFrom = normalizeFileSegment(first.filters?.date_from || 'all-time');
  const dateTo = normalizeFileSegment(first.filters?.date_to || 'all-time');
  return `all_reports_${branchPart}_${dateFrom}_${dateTo}`.replace(/-+/g, '-');
}

function downloadTextFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildFilterSummary(report: ReportPayload) {
  const parts: string[] = [];
  if (report.filters?.branch_label) {
    parts.push(`Branch scope: ${report.filters.branch_label}`);
  }
  if (report.filters?.date_from || report.filters?.date_to) {
    parts.push(
      `Date range: ${report.filters?.date_from || 'Beginning'} to ${report.filters?.date_to || 'Present'}`
    );
  } else {
    parts.push('Date range: All time');
  }
  if (report.filters?.scope_note) {
    parts.push(String(report.filters.scope_note));
  }
  return parts;
}

function buildReportText(report: ReportPayload) {
  const lines: string[] = [];
  lines.push(report.title);
  lines.push(report.description);
  lines.push(`Generated at: ${report.generated_at}`);
  for (const summary of buildFilterSummary(report)) {
    lines.push(summary);
  }
  lines.push('');

  for (const section of report.sections) {
    lines.push(section.title);
    if (section.description) {
      lines.push(section.description);
    }
    if (section.type === 'metrics') {
      section.items.forEach((item) => {
        lines.push(`${item.label}: ${item.value}`);
        if (item.hint) {
          lines.push(`  ${item.hint}`);
        }
      });
    } else {
      lines.push(section.columns.map((column) => column.label).join(' | '));
      section.rows.forEach((row) => {
        lines.push(section.columns.map((column) => String(row[column.key] ?? '')).join(' | '));
      });
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildReportCsv(report: ReportPayload) {
  const lines: string[] = [];
  lines.push(escapeCsv(report.title));
  lines.push(escapeCsv(report.description));
  lines.push(escapeCsv(`Generated at: ${report.generated_at}`));
  buildFilterSummary(report).forEach((summary) => {
    lines.push(escapeCsv(summary));
  });
  lines.push('');

  report.sections.forEach((section) => {
    lines.push(escapeCsv(section.title));
    if (section.description) {
      lines.push(escapeCsv(section.description));
    }

    if (section.type === 'metrics') {
      lines.push('Metric,Value,Hint');
      section.items.forEach((item) => {
        lines.push([escapeCsv(item.label), escapeCsv(item.value), escapeCsv(item.hint || '')].join(','));
      });
    } else {
      lines.push(section.columns.map((column) => escapeCsv(column.label)).join(','));
      section.rows.forEach((row) => {
        lines.push(section.columns.map((column) => escapeCsv(row[column.key] ?? '')).join(','));
      });
    }

    lines.push('');
  });

  return lines.join('\n');
}

function buildReportHtmlDocument(title: string, reports: ReportPayload[]) {
  const body = reports
    .map((report) => {
      const sections = report.sections
        .map((section) => {
          if (section.type === 'metrics') {
            const cards = section.items
              .map(
                (item) => `
                  <div class="metric-card tone-${escapeHtml(item.tone || 'neutral')}">
                    <div class="metric-label">${escapeHtml(item.label)}</div>
                    <div class="metric-value">${escapeHtml(item.value)}</div>
                    <div class="metric-hint">${escapeHtml(item.hint || '')}</div>
                  </div>
                `
              )
              .join('');

            return `
              <section class="report-section">
                <h3>${escapeHtml(section.title)}</h3>
                ${section.description ? `<p class="section-description">${escapeHtml(section.description)}</p>` : ''}
                <div class="metric-grid">${cards}</div>
              </section>
            `;
          }

          const header = section.columns
            .map((column) => `<th>${escapeHtml(column.label)}</th>`)
            .join('');
          const rows = section.rows
            .map((row) => {
              const cells = section.columns
                .map((column) => `<td>${escapeHtml(row[column.key] ?? '')}</td>`)
                .join('');
              return `<tr>${cells}</tr>`;
            })
            .join('');

          return `
            <section class="report-section">
              <h3>${escapeHtml(section.title)}</h3>
              ${section.description ? `<p class="section-description">${escapeHtml(section.description)}</p>` : ''}
              <div class="table-wrap">
                <table>
                  <thead><tr>${header}</tr></thead>
                  <tbody>${rows || `<tr><td colspan="${section.columns.length}">No data available.</td></tr>`}</tbody>
                </table>
              </div>
            </section>
          `;
        })
        .join('');

      const filters = buildFilterSummary(report)
        .map((summary) => `<li>${escapeHtml(summary)}</li>`)
        .join('');

      return `
        <article class="report-shell">
          <header class="report-header">
            <p class="report-eyebrow">${escapeHtml(report.report_key)}</p>
            <h2>${escapeHtml(report.title)}</h2>
            <p class="report-description">${escapeHtml(report.description)}</p>
            <p class="report-generated">Generated at: ${escapeHtml(report.generated_at)}</p>
            <ul class="filter-list">${filters}</ul>
          </header>
          ${sections}
        </article>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 32px;
    }
    .report-shell {
      background: #ffffff;
      border: 1px solid #dbe4f0;
      border-radius: 18px;
      padding: 24px;
      margin: 0 0 28px;
      box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
      page-break-inside: avoid;
    }
    .report-eyebrow {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #2563eb;
      font-weight: 700;
      margin: 0 0 8px;
    }
    .report-header h2 {
      margin: 0 0 8px;
      font-size: 28px;
    }
    .report-description,
    .report-generated,
    .section-description,
    .metric-hint,
    .filter-list {
      color: #475569;
    }
    .filter-list {
      margin: 12px 0 0;
      padding-left: 18px;
    }
    .report-section {
      margin-top: 22px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .metric-card {
      border-radius: 14px;
      padding: 14px;
      border: 1px solid #dbe4f0;
      background: #f8fafc;
    }
    .metric-card.tone-good {
      background: #ecfdf5;
      border-color: #a7f3d0;
    }
    .metric-card.tone-warn {
      background: #fff7ed;
      border-color: #fdba74;
    }
    .metric-card.tone-danger {
      background: #fef2f2;
      border-color: #fca5a5;
    }
    .metric-label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #64748b;
      margin-bottom: 8px;
    }
    .metric-value {
      font-size: 26px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 6px;
    }
    .table-wrap {
      overflow: hidden;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #ffffff;
    }
    th,
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }
    th {
      background: #f8fafc;
      color: #475569;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }
      .report-shell {
        border: none;
        box-shadow: none;
        padding: 0 0 18px;
        margin: 0 0 28px;
      }
    }
  </style>
</head>
<body>
  ${body}
</body>
</html>`;
}

function openPrintPreview(title: string, html: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const printFrame = document.createElement('iframe');

  printFrame.title = `${title} Print Preview`;
  printFrame.setAttribute('aria-hidden', 'true');
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '0';
  printFrame.style.height = '0';
  printFrame.style.border = '0';
  printFrame.style.visibility = 'hidden';

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    URL.revokeObjectURL(objectUrl);
    printFrame.remove();
  };

  printFrame.addEventListener(
    'load',
    () => {
      const frameWindow = printFrame.contentWindow;
      if (!frameWindow) {
        cleanup();
        throw new Error('Unable to open the print preview in this browser.');
      }

      const handleAfterPrint = () => {
        frameWindow.removeEventListener('afterprint', handleAfterPrint);
        cleanup();
      };

      frameWindow.addEventListener('afterprint', handleAfterPrint);
      window.setTimeout(() => {
        frameWindow.focus();
        frameWindow.print();
        window.setTimeout(cleanup, 60_000);
      }, 150);
    },
    { once: true },
  );

  document.body.appendChild(printFrame);
  printFrame.src = objectUrl;
}

async function downloadPdfDocument(title: string, reports: ReportPayload[], filename: string) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;
  const dividerColor: [number, number, number] = [226, 232, 240];
  const titleColor: [number, number, number] = [15, 23, 42];
  const bodyColor: [number, number, number] = [51, 65, 85];
  const mutedColor: [number, number, number] = [100, 116, 139];
  const accentColor: [number, number, number] = [29, 78, 216];
  let cursorY = margin;

  const ensureSpace = (requiredHeight: number) => {
    if (cursorY + requiredHeight <= pageHeight - margin) {
      return false;
    }

    pdf.addPage();
    cursorY = margin;
    return true;
  };

  const drawWrappedText = (
    text: string,
    options: {
      fontSize?: number;
      fontStyle?: 'normal' | 'bold';
      color?: [number, number, number];
      indent?: number;
      after?: number;
      lineHeight?: number;
    } = {},
  ) => {
    const safeText = String(text || '').trim();
    if (!safeText) {
      return;
    }

    const fontSize = options.fontSize ?? 11;
    const indent = options.indent ?? 0;
    const after = options.after ?? 6;
    const lineHeight = options.lineHeight ?? Math.max(fontSize * 1.35, 14);
    const lines = pdf.splitTextToSize(safeText, Math.max(120, contentWidth - indent));

    ensureSpace(lines.length * lineHeight + after);
    pdf.setFont('helvetica', options.fontStyle ?? 'normal');
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...(options.color ?? bodyColor));
    pdf.text(lines, margin + indent, cursorY);
    cursorY += lines.length * lineHeight + after;
  };

  const drawDivider = (spacing = 16) => {
    ensureSpace(spacing);
    pdf.setDrawColor(...dividerColor);
    pdf.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += spacing;
  };

  const drawMetricsSection = (section: Extract<ReportSection, { type: 'metrics' }>) => {
    section.items.forEach((item) => {
      drawWrappedText(`${item.label}: ${item.value}`, {
        fontSize: 11,
        fontStyle: 'bold',
        color: titleColor,
        after: 4,
      });
      if (item.hint) {
        drawWrappedText(item.hint, {
          fontSize: 10,
          color: mutedColor,
          indent: 12,
          after: 8,
        });
      } else {
        cursorY += 4;
      }
    });
  };

  const drawTableSection = (section: Extract<ReportSection, { type: 'table' }>) => {
    const columnCount = Math.max(section.columns.length, 1);
    const cellPadding = 6;
    const headerFontSize = 9;
    const bodyFontSize = 8.5;
    const columnWidth = contentWidth / columnCount;

    const measureRow = (cells: string[], fontSize: number) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontSize);
      const linesByCell = cells.map((cell) =>
        pdf.splitTextToSize(String(cell ?? ''), Math.max(24, columnWidth - cellPadding * 2))
      );
      const lineHeight = Math.max(fontSize * 1.35, 12);
      const rowHeight =
        Math.max(...linesByCell.map((lines) => Math.max(lines.length, 1))) * lineHeight + cellPadding * 2;

      return { linesByCell, lineHeight, rowHeight };
    };

    const drawMeasuredRow = (
      cells: string[],
      measured: ReturnType<typeof measureRow>,
      isHeader: boolean,
    ) => {
      let x = margin;
      for (let index = 0; index < cells.length; index += 1) {
        pdf.setDrawColor(...dividerColor);
        if (isHeader) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(x, cursorY, columnWidth, measured.rowHeight, 'FD');
        } else {
          pdf.rect(x, cursorY, columnWidth, measured.rowHeight, 'S');
        }

        pdf.setFont('helvetica', isHeader ? 'bold' : 'normal');
        pdf.setFontSize(isHeader ? headerFontSize : bodyFontSize);
        pdf.setTextColor(...(isHeader ? bodyColor : titleColor));
        pdf.text(
          measured.linesByCell[index],
          x + cellPadding,
          cursorY + cellPadding + (isHeader ? headerFontSize : bodyFontSize),
        );
        x += columnWidth;
      }

      cursorY += measured.rowHeight;
    };

    const drawHeader = () => {
      const headerCells = section.columns.map((column) => column.label);
      const measuredHeader = measureRow(headerCells, headerFontSize);
      ensureSpace(measuredHeader.rowHeight);
      drawMeasuredRow(headerCells, measuredHeader, true);
    };

    drawHeader();

    const dataRows =
      section.rows.length > 0
        ? section.rows.map((row) => section.columns.map((column) => String(row[column.key] ?? '')))
        : [section.columns.map((column, index) => (index === 0 ? 'No data available.' : ''))];

    dataRows.forEach((cells) => {
      const measuredRow = measureRow(cells, bodyFontSize);
      if (ensureSpace(measuredRow.rowHeight)) {
        drawHeader();
      }
      drawMeasuredRow(cells, measuredRow, false);
    });

    cursorY += 12;
  };

  reports.forEach((report, reportIndex) => {
    if (reportIndex > 0) {
      pdf.addPage();
      cursorY = margin;
    }

    drawWrappedText(report.report_key.replace(/_/g, ' '), {
      fontSize: 10,
      fontStyle: 'bold',
      color: accentColor,
      after: 8,
    });
    drawWrappedText(report.title, {
      fontSize: 20,
      fontStyle: 'bold',
      color: titleColor,
      after: 8,
      lineHeight: 24,
    });
    drawWrappedText(report.description, {
      fontSize: 11,
      color: bodyColor,
      after: 10,
    });
    drawWrappedText(`Generated at: ${report.generated_at}`, {
      fontSize: 10,
      color: mutedColor,
      after: 6,
    });
    buildFilterSummary(report).forEach((summary) => {
      drawWrappedText(summary, {
        fontSize: 10,
        color: mutedColor,
        after: 4,
      });
    });

    drawDivider(18);

    report.sections.forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        drawDivider(14);
      }

      drawWrappedText(section.title, {
        fontSize: 14,
        fontStyle: 'bold',
        color: titleColor,
        after: 6,
      });
      if (section.description) {
        drawWrappedText(section.description, {
          fontSize: 10,
          color: mutedColor,
          after: 10,
        });
      }

      if (section.type === 'metrics') {
        drawMetricsSection(section);
      } else {
        drawTableSection(section);
      }
    });
  });

  pdf.setProperties({ title });
  pdf.save(filename);
}

export async function downloadSingleReport(report: ReportPayload, format: ReportExportFormat) {
  const baseName = resolveReportFileBaseName(report);

  if (format === 'json') {
    downloadTextFile(JSON.stringify(report, null, 2), `${baseName}.json`, 'application/json;charset=utf-8');
    return;
  }

  if (format === 'txt') {
    downloadTextFile(buildReportText(report), `${baseName}.txt`, 'text/plain;charset=utf-8');
    return;
  }

  if (format === 'csv') {
    downloadTextFile(buildReportCsv(report), `${baseName}.csv`, 'text/csv;charset=utf-8');
    return;
  }

  const html = buildReportHtmlDocument(report.title, [report]);
  if (format === 'html') {
    downloadTextFile(html, `${baseName}.html`, 'text/html;charset=utf-8');
    return;
  }

  if (format === 'print') {
    openPrintPreview(report.title, html);
    return;
  }

  await downloadPdfDocument(report.title, [report], `${baseName}.pdf`);
}

export async function downloadAllReports(reports: ReportPayload[], format: ReportExportFormat) {
  const safeReports = reports.filter(Boolean);
  if (safeReports.length === 0) {
    throw new Error('No reports are available to export.');
  }

  const baseName = resolveCollectionFileBaseName(safeReports);

  if (format === 'json') {
    downloadTextFile(JSON.stringify(safeReports, null, 2), `${baseName}.json`, 'application/json;charset=utf-8');
    return;
  }

  if (format === 'txt') {
    const content = safeReports.map((report) => buildReportText(report)).join('\n\n' + '='.repeat(80) + '\n\n');
    downloadTextFile(content, `${baseName}.txt`, 'text/plain;charset=utf-8');
    return;
  }

  if (format === 'csv') {
    const content = safeReports.map((report) => buildReportCsv(report)).join('\n\n');
    downloadTextFile(content, `${baseName}.csv`, 'text/csv;charset=utf-8');
    return;
  }

  const html = buildReportHtmlDocument('All Reports', safeReports);
  if (format === 'html') {
    downloadTextFile(html, `${baseName}.html`, 'text/html;charset=utf-8');
    return;
  }

  if (format === 'print') {
    openPrintPreview('All Reports', html);
    return;
  }

  await downloadPdfDocument('All Reports', safeReports, `${baseName}.pdf`);
}
