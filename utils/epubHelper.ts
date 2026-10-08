import JSZip from 'jszip';

export interface EpubParsedData {
  title: string;
  author?: string;
  description?: string;
  genre?: string;
  chapters: {
    title: string;
    content: string;
  }[];
}

export interface EpubChapterInput {
  id?: string;
  title: string;
  content: string;
  order?: number;
}

export interface EpubGenerateOptions {
  title: string;
  author?: string;
  description?: string;
  genre?: string;
  chapters: EpubChapterInput[];
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Format plain text into clean XHTML paragraphs
 */
function textToXhtmlParagraphs(text: string): string {
  if (!text) return '<p></p>';
  const paragraphs = text.split(/\r?\n/);
  const out: string[] = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (trimmed.length > 0) {
      out.push(`    <p>${escapeXml(trimmed)}</p>`);
    }
  }

  return out.length > 0 ? out.join('\n') : '<p></p>';
}

/**
 * Parse an EPUB file into structured story and chapter data.
 */
export async function parseEpubFile(file: File | Blob): Promise<EpubParsedData> {
  const zip = await JSZip.loadAsync(file);

  // 1. Locate container.xml to find root OPF file
  const containerXmlStr = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXmlStr) {
    throw new Error('File EPUB không hợp lệ (không tìm thấy META-INF/container.xml)');
  }

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXmlStr, 'application/xml');
  const rootfileEl = containerDoc.querySelector('rootfile');
  const opfPath = rootfileEl?.getAttribute('full-path');

  if (!opfPath) {
    throw new Error('File EPUB không chứa đường dẫn tệp mô tả OPF');
  }

  // 2. Read OPF file
  const opfStr = await zip.file(opfPath)?.async('string');
  if (!opfStr) {
    throw new Error(`Không thể đọc tệp OPF tại: ${opfPath}`);
  }

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfDoc = parser.parseFromString(opfStr, 'application/xml');

  // Extract Metadata
  const title = opfDoc.querySelector('title, dc\\:title')?.textContent?.trim() || 
    (file instanceof File ? file.name.replace(/\.epub$/i, '') : 'Truyện Không Tên');
  const author = opfDoc.querySelector('creator, dc\\:creator')?.textContent?.trim() || 'Khuyết Danh';
  const description = opfDoc.querySelector('description, dc\\:description')?.textContent?.trim() || '';
  const genre = opfDoc.querySelector('subject, dc\\:subject')?.textContent?.trim() || 'Chưa xác định';

  // Extract Manifest (id -> href)
  const manifestMap = new Map<string, string>();
  let ncxHref: string | null = null;
  const itemEls = opfDoc.querySelectorAll('manifest item');
  itemEls.forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    const mediaType = item.getAttribute('media-type');
    if (id && href) {
      manifestMap.set(id, href);
      if (mediaType === 'application/x-dtbncx+xml' || id.toLowerCase().includes('toc') || href.endsWith('.ncx')) {
        ncxHref = href;
      }
    }
  });

  // Extract NCX Table of Contents if available to map chapter titles
  const tocTitleMap = new Map<string, string>();
  if (ncxHref) {
    const fullNcxPath = resolvePath(opfDir, ncxHref);
    const ncxStr = await zip.file(fullNcxPath)?.async('string');
    if (ncxStr) {
      try {
        const ncxDoc = parser.parseFromString(ncxStr, 'application/xml');
        const navPoints = ncxDoc.querySelectorAll('navPoint');
        navPoints.forEach((np) => {
          const navText = np.querySelector('navLabel text')?.textContent?.trim();
          const src = np.querySelector('content')?.getAttribute('src');
          if (navText && src) {
            const cleanSrc = src.split('#')[0];
            const resolvedSrc = resolvePath(opfDir, cleanSrc);
            if (!tocTitleMap.has(resolvedSrc)) {
              tocTitleMap.set(resolvedSrc, navText);
            }
          }
        });
      } catch (e) {
        console.warn('Không thể đọc chi tiết TOC NCX:', e);
      }
    }
  }

  // Extract Spine order
  const spineItemrefs = opfDoc.querySelectorAll('spine itemref');
  const chapterHrefs: string[] = [];
  spineItemrefs.forEach((ref) => {
    const idref = ref.getAttribute('idref');
    if (idref && manifestMap.has(idref)) {
      chapterHrefs.push(manifestMap.get(idref)!);
    }
  });

  const rawChapters: { title: string; content: string }[] = [];

  for (let i = 0; i < chapterHrefs.length; i++) {
    const href = chapterHrefs[i];
    const fullPath = resolvePath(opfDir, href);
    const chapterHtmlStr = await zip.file(fullPath)?.async('string');
    if (!chapterHtmlStr) continue;

    const chapterDoc = parser.parseFromString(chapterHtmlStr, 'text/html');

    // Remove noise elements
    chapterDoc.querySelectorAll('script, style, meta, link, svg, noscript').forEach(el => el.remove());

    const body = chapterDoc.body || chapterDoc.documentElement;
    if (!body) continue;

    // Detect title
    let detectedTitle = tocTitleMap.get(fullPath) || '';
    if (!detectedTitle) {
      const heading = chapterDoc.querySelector('h1, h2, h3');
      if (heading && heading.textContent?.trim()) {
        detectedTitle = heading.textContent.trim();
      }
    }
    if (!detectedTitle) {
      const docTitle = chapterDoc.querySelector('title')?.textContent?.trim();
      if (docTitle && !/^(untitled|cover|page|trang)/i.test(docTitle)) {
        detectedTitle = docTitle;
      }
    }

    // Extract text paragraphs
    const paragraphs: string[] = [];
    const blockEls = body.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote');

    if (blockEls.length > 0) {
      blockEls.forEach((el) => {
        // Skip child elements if parent was already a p or blockquote
        if (el.tagName.toLowerCase() === 'div' && el.querySelector('p')) {
          return;
        }
        const text = el.textContent?.trim();
        if (text) {
          paragraphs.push(text);
        }
      });
    } else {
      // Fallback: split raw body innerText or textContent by newlines
      const rawText = body.textContent || '';
      paragraphs.push(...rawText.split('\n').map(l => l.trim()).filter(Boolean));
    }

    const content = paragraphs.join('\n\n').trim();

    // Skip empty items (e.g. cover page only having an image tag)
    if (!content && !detectedTitle) continue;

    if (!detectedTitle) {
      // Try to find if first paragraph looks like chapter title
      const firstLine = paragraphs[0] || '';
      if (/^(Chương|Chapter|Hồi|Tiết|Quyển)\s+\d+/i.test(firstLine)) {
        detectedTitle = firstLine;
      } else {
        detectedTitle = `Chương ${rawChapters.length + 1}`;
      }
    }

    rawChapters.push({
      title: detectedTitle,
      content: content
    });
  }

  // If no chapters could be extracted from spine, try finding HTML files in the zip directly
  if (rawChapters.length === 0) {
    const htmlFiles = Object.keys(zip.files).filter(f => /\.(html|xhtml|htm)$/i.test(f) && !f.includes('cover') && !f.includes('nav'));
    htmlFiles.sort();
    for (let i = 0; i < htmlFiles.length; i++) {
      const path = htmlFiles[i];
      const str = await zip.file(path)?.async('string');
      if (!str) continue;
      const doc = parser.parseFromString(str, 'text/html');
      doc.querySelectorAll('script, style').forEach(el => el.remove());
      const text = doc.body?.textContent?.trim() || '';
      if (text) {
        rawChapters.push({
          title: `Chương ${i + 1}`,
          content: text
        });
      }
    }
  }

  return {
    title,
    author,
    description,
    genre,
    chapters: rawChapters
  };
}

/**
 * Resolve relative paths inside EPUB ZIP
 */
function resolvePath(baseDir: string, relativePath: string): string {
  if (!baseDir) return relativePath;
  const parts = (baseDir + relativePath).split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

/**
 * Generate a complete, standard-compliant EPUB 3 / EPUB 2 compatible file blob.
 */
export async function generateEpub(options: EpubGenerateOptions): Promise<Blob> {
  const {
    title = 'Tác Phẩm',
    author = 'Aetheria Author',
    description = '',
    genre = 'Tiểu thuyết',
    chapters = []
  } = options;

  const zip = new JSZip();
  const bookId = `urn:uuid:${generateSimpleUuid()}`;
  const nowIso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const safeTitle = escapeXml(title);
  const safeAuthor = escapeXml(author);
  const safeGenre = escapeXml(genre);
  const safeDesc = escapeXml(description);

  // 1. mimetype: MUST BE uncompressed and first in the zip archive
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  // 3. OEBPS/stylesheet.css
  const stylesheetContent = `@charset "utf-8";
body {
  font-family: "Times New Roman", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Palatino Linotype", Georgia, serif;
  line-height: 1.75;
  margin: 5%;
  padding: 0;
  color: #111111;
  background-color: #ffffff;
}

h1.book-title {
  font-size: 2.2em;
  text-align: center;
  margin-top: 2.5em;
  margin-bottom: 0.4em;
  font-weight: bold;
  color: #1a202c;
}

.book-author {
  text-align: center;
  font-size: 1.1em;
  font-weight: 600;
  color: #4a5568;
  margin-bottom: 0.5em;
}

.book-meta {
  text-align: center;
  font-size: 0.9em;
  color: #718096;
  margin-bottom: 2em;
}

.book-synopsis {
  background-color: #f7fafc;
  border-left: 4px solid #4a5568;
  padding: 1.2em 1.5em;
  margin: 2.5em auto;
  font-style: italic;
  line-height: 1.6;
}

h2.chapter-title {
  font-size: 1.5em;
  text-align: center;
  margin-top: 1.8em;
  margin-bottom: 1.5em;
  font-weight: bold;
  color: #2d3748;
  page-break-before: always;
}

p {
  text-indent: 1.8em;
  margin: 0.45em 0;
  text-align: justify;
}

hr {
  border: 0;
  height: 1px;
  background: #e2e8f0;
  margin: 2em 0;
}
`;
  zip.file('OEBPS/stylesheet.css', stylesheetContent);

  // 4. OEBPS/title.xhtml (Title page)
  const titlePageXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head>
  <title>${safeTitle}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <div class="title-page">
    <h1 class="book-title">${safeTitle}</h1>
    <div class="book-author">Tác giả / Dịch giả: ${safeAuthor}</div>
    <div class="book-meta">Thể loại: ${safeGenre}</div>
    ${description ? `<div class="book-synopsis"><p><strong>[TÓM TẮT]</strong></p>${textToXhtmlParagraphs(description)}</div>` : ''}
  </div>
</body>
</html>`;
  zip.file('OEBPS/title.xhtml', titlePageXhtml);

  // 5. Add chapters
  const validChapters = chapters.map((ch, idx) => ({
    index: idx + 1,
    title: ch.title || `Chương ${idx + 1}`,
    content: ch.content || ''
  }));

  validChapters.forEach((ch) => {
    const filename = `chapter_${String(ch.index).padStart(4, '0')}.xhtml`;
    const chapterSafeTitle = escapeXml(ch.title);
    const chapterXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head>
  <title>${chapterSafeTitle}</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <section epub:type="chapter">
    <h2 class="chapter-title">${chapterSafeTitle}</h2>
${textToXhtmlParagraphs(ch.content)}
  </section>
</body>
</html>`;
    zip.file(`OEBPS/${filename}`, chapterXhtml);
  });

  // 6. OEBPS/toc.ncx (NCX TOC for EPUB 2 & e-readers like Kindle / Kobo)
  const navPoints = validChapters.map((ch, idx) => {
    const filename = `chapter_${String(ch.index).padStart(4, '0')}.xhtml`;
    return `    <navPoint id="navPoint-${idx + 2}" playOrder="${idx + 2}">
      <navLabel>
        <text>${escapeXml(ch.title)}</text>
      </navLabel>
      <content src="${filename}"/>
    </navPoint>`;
  }).join('\n');

  const ncxContent = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${safeTitle}</text>
  </docTitle>
  <docAuthor>
    <text>${safeAuthor}</text>
  </docAuthor>
  <navMap>
    <navPoint id="navPoint-1" playOrder="1">
      <navLabel>
        <text>Trang Bìa &amp; Giới Thiệu</text>
      </navLabel>
      <content src="title.xhtml"/>
    </navPoint>
${navPoints}
  </navMap>
</ncx>`;
  zip.file('OEBPS/toc.ncx', ncxContent);

  // 7. OEBPS/nav.xhtml (EPUB 3 Navigation)
  const navLi = validChapters.map((ch) => {
    const filename = `chapter_${String(ch.index).padStart(4, '0')}.xhtml`;
    return `        <li><a href="${filename}">${escapeXml(ch.title)}</a></li>`;
  }).join('\n');

  const navXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="vi" lang="vi">
<head>
  <title>Mục Lục</title>
  <link rel="stylesheet" type="text/css" href="stylesheet.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Mục Lục</h1>
    <ol>
      <li><a href="title.xhtml">Giới Thiệu</a></li>
${navLi}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navXhtml);

  // 8. OEBPS/content.opf
  const manifestItems = validChapters.map((ch) => {
    const filename = `chapter_${String(ch.index).padStart(4, '0')}.xhtml`;
    return `    <item id="chapter_${ch.index}" href="${filename}" media-type="application/xhtml+xml"/>`;
  }).join('\n');

  const spineItems = validChapters.map((ch) => {
    return `    <itemref idref="chapter_${ch.index}"/>`;
  }).join('\n');

  const opfContent = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookID">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookID">${bookId}</dc:identifier>
    <dc:title>${safeTitle}</dc:title>
    <dc:creator>${safeAuthor}</dc:creator>
    <dc:language>vi</dc:language>
    <dc:subject>${safeGenre}</dc:subject>
    ${safeDesc ? `<dc:description>${safeDesc}</dc:description>` : ''}
    <meta property="dcterms:modified">${nowIso}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="stylesheet.css" media-type="text/css"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
    <itemref idref="title"/>
${spineItems}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', opfContent);

  // Generate binary Blob
  return await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip'
  });
}

/**
 * Triggers browser download of generated EPUB file.
 */
export async function downloadEpubFile(options: EpubGenerateOptions, filename?: string): Promise<void> {
  const blob = await generateEpub(options);
  const cleanName = filename || `${options.title.replace(/[^a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF _-]/g, '_').trim()}.epub`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanName.endsWith('.epub') ? cleanName : `${cleanName}.epub`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateSimpleUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
