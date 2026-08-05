const sharp = require('sharp');

// Cheap saliency heuristic (no face detection / native ML deps): downsamples
// the image to a small grid and scores each cell by local contrast (variance
// of greyscale values), which tends to land on faces, logos, and other
// detailed subjects rather than flat sky/background. A mild center-distance
// penalty keeps a noisy corner from beating a moderately-detailed subject
// near the middle of the frame. Returns {x, y} as percentages (0-100).
async function computeFocalPoint(buffer) {
  const GRID = 6;
  const size = GRID * 10;

  const { data, info } = await sharp(buffer)
    .resize(size, size, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cell = size / GRID;
  let best = { score: -Infinity, cx: (GRID - 1) / 2, cy: (GRID - 1) / 2 };

  for (let gy = 0; gy < GRID; gy++) {
    for (let gx = 0; gx < GRID; gx++) {
      let sum = 0, sumSq = 0, n = 0;
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) {
          const v = data[y * info.width + x];
          sum += v;
          sumSq += v * v;
          n++;
        }
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      const distFromCenter = Math.hypot(gx - (GRID - 1) / 2, gy - (GRID - 1) / 2);
      const score = variance - distFromCenter * 8;
      if (score > best.score) best = { score, cx: gx, cy: gy };
    }
  }

  return {
    x: Math.round(((best.cx + 0.5) / GRID) * 1000) / 10,
    y: Math.round(((best.cy + 0.5) / GRID) * 1000) / 10,
  };
}

module.exports = { computeFocalPoint };
