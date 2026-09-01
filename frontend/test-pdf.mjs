import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.min.mjs';
const pdfWorkerSrc = await import('pdfjs-dist/build/pdf.worker.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc.default || pdfWorkerSrc;

async function extractTextFromPdf(path) {
  const data = new Uint8Array(fs.readFileSync(path));
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const allItems = textContent.items
      .filter((item) => 'str' in item && item.str.trim() !== '')
      .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5] }))
      .sort((a, b) => b.y - a.y);
    const lines = [];
    let currentLine = [];
    let currentY = null;
    for (const item of allItems) {
      if (currentY === null || Math.abs(currentY - item.y) <= 5) {
        currentLine.push(item);
        if (currentY === null) currentY = item.y;
      } else {
        lines.push(currentLine);
        currentLine = [item];
        currentY = item.y;
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);
    for (const line of lines) {
      line.sort((a, b) => a.x - b.x);
      const lineStr = line.map(item => item.text).join(' ');
      fullText += lineStr + '\n';
    }
  }
  return fullText;
}

(async () => {
  const t1 = await extractTextFromPdf('../../.user_uploaded/media_1788180738412.pdf');
  fs.writeFileSync('akbank-out.txt', t1);
  console.log('AKBANK TEXT LENGTH:', t1.length);
  const m1 = t1.match(/\d{2}\/\d{2}\/\d{4}/g);
  console.log('AKBANK DATE MATCHES:', m1 ? m1.length : 0);

  const t2 = await extractTextFromPdf('../../.user_uploaded/media_1788180738394.pdf');
  fs.writeFileSync('garanti-out.txt', t2);
  console.log('GARANTI TEXT LENGTH:', t2.length);
})();

