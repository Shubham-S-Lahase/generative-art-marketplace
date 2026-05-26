import React from 'react';

type Point = { date: string; views: number };

const ViewsTimeSeriesChart = ({ data = [] }: { data?: Point[] }) => {
  if (!data.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
        View data will appear as visitors explore your artworks.
      </p>
    );
  }

  const max = Math.max(...data.map((d) => d.views), 1);
  const w = 400;
  const h = 120;
  const pad = 8;
  const step = (w - pad * 2) / Math.max(data.length - 1, 1);

  const points = data
    .map((d, i) => {
      const x = pad + i * step;
      const y = h - pad - (d.views / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-32 text-indigo-500">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} />
      </svg>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
};

export default ViewsTimeSeriesChart;
