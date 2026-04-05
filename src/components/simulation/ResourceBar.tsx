'use client';

import { type Resources } from '@/lib/game-world';
import {
  Coins, Users, Zap, CheckCircle, XCircle,
  Trophy, Repeat, Clock,
} from 'lucide-react';

interface ResourceBarProps {
  resources: Resources;
}

export default function ResourceBar({ resources }: ResourceBarProps) {
  const items = [
    {
      icon: Coins,
      label: 'Money',
      value: resources.money.toLocaleString(),
      color: '#FFD700',
      bgColor: 'rgba(255,215,0,0.1)',
    },
    {
      icon: Users,
      label: 'Agents',
      value: String(resources.population),
      color: '#8B5CF6',
      bgColor: 'rgba(139,92,246,0.1)',
    },
    {
      icon: Zap,
      label: 'Energy',
      value: `${resources.totalEnergy}%`,
      color: resources.totalEnergy > 30 ? '#10B981' : '#EF4444',
      bgColor: resources.totalEnergy > 30 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
    },
    {
      icon: CheckCircle,
      label: 'Done',
      value: String(resources.tasksCompleted),
      color: '#10B981',
      bgColor: 'rgba(16,185,129,0.1)',
    },
    {
      icon: XCircle,
      label: 'Failed',
      value: String(resources.tasksFailed),
      color: '#EF4444',
      bgColor: 'rgba(239,68,68,0.1)',
    },
    {
      icon: Repeat,
      label: 'Iter',
      value: `${resources.iteration}/${resources.maxIterations}`,
      color: '#6366F1',
      bgColor: 'rgba(99,102,241,0.1)',
    },
    {
      icon: Trophy,
      label: 'Quality',
      value: resources.qualityScore > 0 ? `${resources.qualityScore}/10` : '—',
      color: resources.qualityScore >= resources.qualityThreshold ? '#10B981' : '#F59E0B',
      bgColor: resources.qualityScore >= resources.qualityThreshold ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
    },
  ];

  return (
    <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none">
      <div className="flex items-center justify-center gap-1 p-1.5">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-1 px-2 py-1 rounded-lg border backdrop-blur-md"
            style={{
              backgroundColor: item.bgColor,
              borderColor: item.color + '20',
            }}
          >
            <item.icon size={10} style={{ color: item.color }} />
            <span
              className="text-[9px] font-bold font-mono"
              style={{ color: item.color }}
            >
              {item.value}
            </span>
            <span className="text-[7px] text-white/25 hidden sm:inline">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
