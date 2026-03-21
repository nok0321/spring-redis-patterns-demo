import { useEffect, useState } from 'react';
import type { SagaStep } from '../../types/transaction';

const STATUS_CONFIG = {
  SUCCESS:     { bg: 'bg-green-900/50',  border: 'border-green-700',  text: 'text-green-300',  icon: '✓' },
  FAILED:      { bg: 'bg-red-900/50',    border: 'border-red-700',    text: 'text-red-300',    icon: '✗' },
  COMPENSATED: { bg: 'bg-orange-900/50', border: 'border-orange-700', text: 'text-orange-300', icon: '↩' },
};

interface SagaFlowDiagramProps {
  steps: SagaStep[];
  compensationSteps?: SagaStep[];
}

export function SagaFlowDiagram({ steps, compensationSteps }: SagaFlowDiagramProps) {
  const [visibleMain, setVisibleMain] = useState(0);
  const [visibleComp, setVisibleComp] = useState(0);

  // ステップを上から順次表示（200ms 間隔）
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Reset via setTimeout(0) to avoid synchronous setState in effect body
    timers.push(setTimeout(() => { setVisibleMain(0); setVisibleComp(0); }, 0));
    steps.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleMain(i + 1), i * 200));
    });
    return () => timers.forEach(clearTimeout);
  }, [steps]);

  useEffect(() => {
    if (!compensationSteps?.length) return;
    const baseDelay = steps.length * 200 + 300;
    compensationSteps.forEach((_, i) => {
      setTimeout(() => setVisibleComp(i + 1), baseDelay + i * 200);
    });
  }, [compensationSteps, steps.length]);

  const renderStep = (step: SagaStep, idx: number, visible: boolean) => {
    const cfg = STATUS_CONFIG[step.status];
    return (
      <div
        key={idx}
        className={`flex gap-3 transition-all duration-300 ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
        }`}
      >
        {/* Connector */}
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border-2 ${cfg.bg} ${cfg.border} ${cfg.text}`}>
            {cfg.icon}
          </div>
          {idx < steps.length - 1 && (
            <div className="w-0.5 h-4 bg-gray-700 mt-1" />
          )}
        </div>
        {/* Content */}
        <div className={`flex-1 rounded-lg border px-3 py-2 mb-2 ${cfg.bg} ${cfg.border}`}>
          <div className={`text-sm font-medium ${cfg.text}`}>{step.name}</div>
          <div className="text-xs text-gray-400 mt-0.5">{step.detail}</div>
          <div className="text-xs text-gray-600 mt-0.5">{step.durationMs}ms</div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* Main steps */}
      <div className="space-y-0">
        {steps.map((step, i) => renderStep(step, i, i < visibleMain))}
      </div>

      {/* Compensation steps */}
      {compensationSteps && compensationSteps.length > 0 && (
        <>
          <div className="flex items-center gap-2 py-2">
            <div className="flex-1 h-px bg-orange-700/50" />
            <span className="text-xs text-orange-400 font-medium">補償処理 (Rollback)</span>
            <div className="flex-1 h-px bg-orange-700/50" />
          </div>
          <div className="space-y-0">
            {compensationSteps.map((step, i) => renderStep(step, i, i < visibleComp))}
          </div>
        </>
      )}
    </div>
  );
}
