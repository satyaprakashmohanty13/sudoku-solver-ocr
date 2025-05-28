async function processImage() {
  const file = document.getElementById('imageInput').files[0];
  if (!file) return alert("Please select an image.");

  const img = new Image();
  const reader = new FileReader();

  reader.onload = function (e) {
    img.src = e.target.result;
    img.onload = async function () {
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const result = await Tesseract.recognize(canvas, 'eng', {
        logger: m => console.log(m)
      });

      const rawText = result.data.text;
      console.log("OCR Output:\n", rawText);
      const grid = parseSudoku(rawText);
      if (grid && solveSudoku(grid)) {
        displayGrid(grid);
      } else {
        alert("Could not solve the Sudoku. Check image clarity.");
      }
    };
  };
  reader.readAsDataURL(file);
}

function parseSudoku(text) {
  let digits = text.replace(/[^0-9]/g, "").split('').map(Number);
  if (digits.length !== 81) return null;
  let grid = [];
  for (let i = 0; i < 9; i++) {
    grid.push(digits.slice(i * 9, (i + 1) * 9));
  }
  return grid;
}

function isValid(board, row, col, num) {
  for (let x = 0; x < 9; x++) {
    if (board[row][x] === num || board[x][col] === num ||
      board[3 * Math.floor(row / 3) + Math.floor(x / 3)][3 * Math.floor(col / 3) + x % 3] === num) {
      return false;
    }
  }
  return true;
}

function solveSudoku(board) {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (board[row][col] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) return true;
            board[row][col] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function displayGrid(grid) {
  const output = document.getElementById('outputGrid');
  output.innerHTML = '';
  for (let row = 0; row < 9; row++) {
    let line = '';
    for (let col = 0; col < 9; col++) {
      line += grid[row][col] + ' ';
    }
    output.innerHTML += `<div>${line}</div>`;
  }
}