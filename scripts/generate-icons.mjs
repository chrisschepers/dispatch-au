import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Radio } from 'lucide-react';
import sharp from 'sharp';
const mark = renderToStaticMarkup(
  React.createElement(Radio, { size: 280, color: '#ffffff', strokeWidth: 1.7 }),
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#d83329"/><g transform="translate(116 116)">${mark}</g></svg>`;
for (const size of [192, 512])
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);
await sharp(Buffer.from(svg))
  .resize(180, 180)
  .png()
  .toFile('public/icons/apple-touch-icon.png');
