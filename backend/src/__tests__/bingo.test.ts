import { generateBingoGrid } from '../engine/BingoEngine';
import { ProbabilityEngine, BingoCardData } from '../engine/ProbabilityEngine';

// ---------------------------------------------------------------------------
// generateBingoGrid
// ---------------------------------------------------------------------------
describe('generateBingoGrid', () => {
  it('should return a 5x5 grid', () => {
    const grid = generateBingoGrid();
    expect(grid.length).toBe(5);
    for (const row of grid) {
      expect(row.length).toBe(5);
    }
  });

  it('should have 0 (FREE) at the center [2][2]', () => {
    const grid = generateBingoGrid();
    expect(grid[2][2]).toBe(0);
  });

  it('should have column 0 values in range 1-15 (B)', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const grid = generateBingoGrid();
      for (let r = 0; r < 5; r++) {
        if (r === 2) continue; // center is FREE
        expect(grid[r][0]).toBeGreaterThanOrEqual(1);
        expect(grid[r][0]).toBeLessThanOrEqual(15);
      }
    }
  });

  it('should have column 1 values in range 16-30 (I)', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const grid = generateBingoGrid();
      for (let r = 0; r < 5; r++) {
        if (r === 2) continue;
        expect(grid[r][1]).toBeGreaterThanOrEqual(16);
        expect(grid[r][1]).toBeLessThanOrEqual(30);
      }
    }
  });

  it('should have column 2 values in range 31-45 (N)', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const grid = generateBingoGrid();
      for (let r = 0; r < 5; r++) {
        if (r === 2) continue;
        expect(grid[r][2]).toBeGreaterThanOrEqual(31);
        expect(grid[r][2]).toBeLessThanOrEqual(45);
      }
    }
  });

  it('should have column 3 values in range 46-60 (G)', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const grid = generateBingoGrid();
      for (let r = 0; r < 5; r++) {
        if (r === 2) continue;
        expect(grid[r][3]).toBeGreaterThanOrEqual(46);
        expect(grid[r][3]).toBeLessThanOrEqual(60);
      }
    }
  });

  it('should have column 4 values in range 61-75 (O)', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const grid = generateBingoGrid();
      for (let r = 0; r < 5; r++) {
        if (r === 2) continue;
        expect(grid[r][4]).toBeGreaterThanOrEqual(61);
        expect(grid[r][4]).toBeLessThanOrEqual(75);
      }
    }
  });

  it('should have unique values within each column', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const grid = generateBingoGrid();
      for (let c = 0; c < 5; c++) {
        const values = [];
        for (let r = 0; r < 5; r++) {
          if (grid[r][c] !== 0) values.push(grid[r][c]);
        }
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// ProbabilityEngine.verifyWin
// ---------------------------------------------------------------------------
describe('ProbabilityEngine.verifyWin', () => {
  // Helper: build a card with specific daubed cells
  function makeCard(daubedCells: [number, number][]): { grid: number[][]; daubed: boolean[][] } {
    const grid = generateBingoGrid();
    const daubed = Array.from({ length: 5 }, () => Array(5).fill(false));

    for (const cell of daubedCells) {
      const [r, c] = cell;
      daubed[r][c] = true;
    }
    // Always daub the FREE space
    daubed[2][2] = true;

    return { grid, daubed };
  }

  it('should return true for a completed row', () => {
    // Daub an entire row (row 0)
    const card = makeCard([[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    expect(ProbabilityEngine.verifyWin(card.grid, card.daubed)).toBe(true);
  });

  it('should return true for a completed column', () => {
    const card = makeCard([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
    expect(ProbabilityEngine.verifyWin(card.grid, card.daubed)).toBe(true);
  });

  it('should return true for the main diagonal (0,0 -> 4,4)', () => {
    // Center [2][2] is FREE so already considered daubed
    const card = makeCard([[0, 0], [1, 1], [3, 3], [4, 4]]);
    // The pattern checks [2][2] which is the FREE space (val=0), so it passes
    expect(ProbabilityEngine.verifyWin(card.grid, card.daubed)).toBe(true);
  });

  it('should return true for the anti-diagonal (0,4 -> 4,0)', () => {
    const card = makeCard([[0, 4], [1, 3], [3, 1], [4, 0]]);
    expect(ProbabilityEngine.verifyWin(card.grid, card.daubed)).toBe(true);
  });

  it('should return false when no line is complete', () => {
    const card = makeCard([[0, 0], [1, 1], [3, 3]]);
    expect(ProbabilityEngine.verifyWin(card.grid, card.daubed)).toBe(false);
  });

  it('should return false with an empty daub (only FREE space)', () => {
    const grid = generateBingoGrid();
    const daubed = Array.from({ length: 5 }, () => Array(5).fill(false));
    daubed[2][2] = true; // FREE only
    expect(ProbabilityEngine.verifyWin(grid, daubed)).toBe(false);
  });

  it('should return true for row that includes the FREE center', () => {
    // Row 2 includes the FREE center at [2][2]
    const card = makeCard([[2, 0], [2, 1], [2, 3], [2, 4]]);
    expect(ProbabilityEngine.verifyWin(card.grid, card.daubed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProbabilityEngine.selectNextBall
// ---------------------------------------------------------------------------
describe('ProbabilityEngine.selectNextBall', () => {
  it('should return a number between 1 and 75', () => {
    const result = ProbabilityEngine.selectNextBall([], [], 'NEUTRAL');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(75);
  });

  it('should return 0 when all 75 numbers are already called', () => {
    const called = Array.from({ length: 75 }, (_, i) => i + 1);
    const result = ProbabilityEngine.selectNextBall([], called, 'NEUTRAL');
    expect(result).toBe(0);
  });

  it('should never return a number that has already been called', () => {
    const called = [1, 2, 3, 10, 20, 30, 50, 75];
    for (let i = 0; i < 20; i++) {
      const result = ProbabilityEngine.selectNextBall([], called, 'NEUTRAL');
      expect(called).not.toContain(result);
    }
  });

  it('should return a number from the remaining pool with NEUTRAL bias', () => {
    const called = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75];
    for (let i = 0; i < 20; i++) {
      const result = ProbabilityEngine.selectNextBall([], called, 'NEUTRAL');
      expect(result).not.toBe(0);
      expect(called).not.toContain(result);
    }
  });
});

// ---------------------------------------------------------------------------
// BingoCardData type
// ---------------------------------------------------------------------------
describe('BingoCardData interface', () => {
  it('should create a valid BingoCardData object', () => {
    const grid = generateBingoGrid();
    const card: BingoCardData = {
      id: 'test-card-1',
      grid,
      daubed: Array.from({ length: 5 }, () => Array(5).fill(false)),
      isBot: false,
    };
    expect(card.id).toBe('test-card-1');
    expect(card.grid.length).toBe(5);
    expect(card.isBot).toBe(false);
  });
});
