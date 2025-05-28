let srcMat, dstMat;
let tileSize;
const inputCanvas = document.getElementById('inputCanvas');
const warpCanvas = document.getElementById('warpCanvas');
const solveBtn = document.getElementById('solveBtn');
const resultDiv = document.getElementById('result');

function onOpenCvReady() {
  document.getElementById('imageInput').addEventListener('change', loadImage);
}

function loadImage(ev) {
  const file = ev.target.files[0];
  const img = new Image();
  img.onload = () => {
    const maxDim = 500;
    let scale = Math.min(maxDim / img.width, maxDim / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    inputCanvas.width = w;
    inputCanvas.height = h;
    const ctx = inputCanvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    detectGrid();
  };
  img.src = URL.createObjectURL(file);
}

function detectGrid() {
  srcMat = cv.imread(inputCanvas);
  let gray = new cv.Mat();
  cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
  cv.adaptiveThreshold(gray, gray, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 11, 2);

  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();
  cv.findContours(gray, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  let maxArea = 0;
  let maxContour;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area > maxArea) {
      const peri = cv.arcLength(cnt, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
      if (approx.rows === 4) {
        maxArea = area;
        maxContour = approx;
      }
      approx.delete();
    }
    cnt.delete();
  }
  hierarchy.delete();
  gray.delete();

  // Warp perspective to get top-down view
  const pts = [];
  for (let i = 0; i < 4; i++) {
    pts.push({x: maxContour.data32S[i*2], y: maxContour.data32S[i*2+1]});
  }
  pts.sort((a, b) => a.x + a.y - (b.x + b.y));
  const [tl, br] = [pts[0], pts[3]];
  const [tr, bl] = [pts[1], pts[2]];
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const size = Math.max(
    Math.hypot(tr.x - tl.x, tr.y - tl.y),
    Math.hypot(br.x - bl.x, br.y - bl.y)
  );
  tileSize = size / 9;
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [0,0, size,0, size,size, 0,size]);
  dstMat = new cv.Mat();
  const M = cv.getPerspectiveTransform(srcPts, dstPts);
  cv.warpPerspective(srcMat, dstMat, M, new cv.Size(size, size));
  cv.imshow(warpCanvas, dstMat);
  srcMat.delete();
  srcPts.delete();
  dstPts.delete();
  M.delete();

  solveBtn.disabled = false;
}

solveBtn.addEventListener('click', () => {
  extractAndSolve();
});

async function extractAndSolve() {
  const ctx = warpCanvas.getContext('2d');
  const cellPromises = [];

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const x = c * tileSize;
      const y = r * tileSize;
      const imgData = ctx.getImageData(x, y, tileSize, tileSize);
      const cellCanvas = document.createElement('canvas');
      cellCanvas.width = tileSize;
      cellCanvas.height = tileSize;
      const cellCtx = cellCanvas.getContext('2d');
      cellCtx.fillStyle = "white";
      cellCtx.fillRect(0, 0, tileSize, tileSize);
      cellCtx.putImageData(imgData, 0, 0);

      // Preprocess cell
      const cellPromise = new Promise(async (resolve) => {
        let mat = cv.imread(cellCanvas);
        cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY);
        cv.threshold(mat, mat, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        cv.imshow(cellCanvas, mat);
        mat.delete();

        const { data: { text } } = await Tesseract.recognize(cellCanvas, 'eng', {
          tessedit_char_whitelist: '123456789',
        });
        resolve(parseInt(text.trim()) || 0);
      });

      cellPromises.push(cellPromise);
    }
  }

  const flatDigits = await Promise.all(cellPromises);
  const digits = [];
  for (let i = 0; i < 81; i += 9) {
    digits.push(flatDigits.slice(i, i + 9));
  }

  const solved = solveSudoku(digits);
  displayResult(solved);
}

// Backtracking solver
function solveSudoku(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        for (let n = 1; n <= 9; n++) {
          if (isValid(board, r, c, n)) {
            board[r][c] = n;
            if (solveSudoku(board)) return board;
            board[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return board;
}

function isValid(board, row, col, num) {
  for (let i = 0; i < 9; i++) {
    if (board[row][i] === num || board[i][col] === num) return false;
    const br = 3 * Math.floor(row/3) + Math.floor(i/3);
    const bc = 3 * Math.floor(col/3) + i%3;
    if (board[br][bc] === num) return false;
  }
  return true;
}

function displayResult(board) {
  let html = '<table>';
  for (let r = 0; r < 9; r++) {
    html += '<tr>';
    for (let c = 0; c < 9; c++) {
      html += `<td>${board[r][c]}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  resultDiv.innerHTML = html;
}
