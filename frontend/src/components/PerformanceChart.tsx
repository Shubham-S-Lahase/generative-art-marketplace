import React, { useMemo } from 'react';
import { TrendingUp } from 'lucide-react';
import type { ChartDataPoint } from '../types';

const VIEWBOX_WIDTH = 480;
const CHART_HEIGHT = 220;
const CHART_PADDING = { top: 16, right: 24, bottom: 52, left: 44 };

const PerformanceChart = ({ chartData = [], summary = {} }: {
  chartData?: ChartDataPoint[];
  summary?: { totalViews?: number; totalLikes?: number };
}) => {
  const { maxValue, bars } = useMemo(() => {
    const items = chartData.map((d) => ({
      id: d.id || d._id,
      title: d.title || 'Untitled',
      views: d.views || 0,
      likes: d.likes || 0,
    }));
    const max = Math.max(...items.flatMap((d) => [d.views, d.likes]), 1);
    return { maxValue: max, bars: items };
  }, [chartData]);

  if (!bars.length) {
    return (
      <div className="min-h-[280px] w-full flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-dashed border-gray-200 dark:border-gray-600">
        <div className="text-center px-4">
          <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300">No artwork views yet</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Publish artworks to see performance here
          </p>
        </div>
      </div>
    );
  }

  const innerW = VIEWBOX_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const innerH = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const groupWidth = innerW / bars.length;
  const barWidth = Math.min(36, Math.max(16, groupWidth * 0.28));

  const yTicks = [0, Math.round(maxValue / 2), maxValue].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="w-full space-y-4">
      <div className="grid grid-cols-3 gap-3 w-full">
        <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 p-3 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total views</p>
          <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
            {(summary.totalViews ?? bars.reduce((s, b) => s + b.views, 0)).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total likes</p>
          <p className="text-lg font-bold text-red-600 dark:text-red-400">
            {(summary.totalLikes ?? bars.reduce((s, b) => s + b.likes, 0)).toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg bg-gray-100 dark:bg-gray-700/50 p-3 text-center">
          <p className="text-xs text-gray-500 dark:text-gray-400">Artworks</p>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{bars.length}</p>
        </div>
      </div>

      <div className="w-full rounded-lg bg-gray-50 dark:bg-gray-900/50 p-4 border border-gray-100 dark:border-gray-700">
        <svg
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${CHART_HEIGHT}`}
          width="100%"
          height={CHART_HEIGHT}
          preserveAspectRatio="xMidYMid meet"
          className="block w-full max-w-full"
          role="img"
          aria-label="Artwork views and likes chart"
        >
          {yTicks.map((tick) => {
            const y = CHART_PADDING.top + innerH - (tick / maxValue) * innerH;
            return (
              <g key={tick}>
                <line
                  x1={CHART_PADDING.left}
                  y1={y}
                  x2={VIEWBOX_WIDTH - CHART_PADDING.right}
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-200 dark:text-gray-700"
                  strokeDasharray={tick === 0 ? undefined : '4 4'}
                />
                <text
                  x={CHART_PADDING.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-gray-500 dark:fill-gray-400 text-[11px]"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {bars.map((item, i) => {
            const cx = CHART_PADDING.left + groupWidth * i + groupWidth / 2;
            const viewsH = (item.views / maxValue) * innerH;
            const likesH = (item.likes / maxValue) * innerH;
            const baseY = CHART_PADDING.top + innerH;

            return (
              <g key={item.id}>
                <rect
                  x={cx - barWidth - 3}
                  y={baseY - viewsH}
                  width={barWidth}
                  height={Math.max(viewsH, item.views > 0 ? 4 : 0)}
                  rx={4}
                  className="fill-indigo-500 dark:fill-indigo-400"
                />
                <rect
                  x={cx + 3}
                  y={baseY - likesH}
                  width={barWidth}
                  height={Math.max(likesH, item.likes > 0 ? 4 : 0)}
                  rx={4}
                  className="fill-rose-400 dark:fill-rose-500"
                />
                <text
                  x={cx}
                  y={CHART_HEIGHT - 12}
                  textAnchor="middle"
                  className="fill-gray-600 dark:fill-gray-300 text-[11px]"
                >
                  {item.title.length > 14 ? `${item.title.slice(0, 13)}…` : item.title}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="flex items-center justify-center gap-6 mt-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-indigo-500" /> Views
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-rose-400" /> Likes
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {bars.map((item) => (
          <li
            key={item.id}
            className="flex justify-between text-sm py-2 px-3 rounded-lg bg-white dark:bg-gray-800"
          >
            <span className="font-medium text-gray-900 dark:text-white truncate pr-2">{item.title}</span>
            <span className="text-gray-500 dark:text-gray-400 shrink-0">
              {item.views} views · {item.likes} likes
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PerformanceChart;
