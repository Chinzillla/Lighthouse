import React, { useMemo } from 'react';
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

Chart.register(
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip
);

function toNumber(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function buildDisplaySeries(value) {
  const currentValue = toNumber(value);
  const baseline = Math.max(currentValue * 0.78, 0);

  return [
    baseline,
    Math.max(currentValue * 0.82, 0),
    Math.max(currentValue * 0.9, 0),
    Math.max(currentValue * 0.88, 0),
    Math.max(currentValue * 0.96, 0),
    currentValue,
  ];
}

function MetricLineChart({ label, value, borderColor, backgroundColor }) {
  const series = useMemo(() => buildDisplaySeries(value), [value]);

  return (
    <section aria-label={`${label} chart`}>
      <div>
        <h3>{label}</h3>
        <span>latest sample</span>
      </div>
      <Line
        data={{
          labels: ['-25s', '-20s', '-15s', '-10s', '-5s', 'now'],
          datasets: [
            {
              label,
              data: series,
              backgroundColor,
              borderColor,
              borderWidth: 2,
              fill: true,
              pointRadius: 2,
              tension: 0.35,
            },
          ],
        }}
        options={{
          animation: false,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              intersect: false,
              mode: 'index',
            },
          },
          responsive: true,
          scales: {
            x: {
              grid: {
                display: false,
              },
            },
            y: {
              beginAtZero: true,
              ticks: {
                precision: 0,
              },
            },
          },
        }}
      />
    </section>
  );
}

export default React.memo(MetricLineChart);
