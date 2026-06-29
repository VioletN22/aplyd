import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

interface StageTransitionProps {
  currentStage: string;
  availableStages: string[];
  onTransition: (stage: string, notes?: string) => Promise<void>;
  isLoading?: boolean;
}

export const StageTransition: React.FC<StageTransitionProps> = ({
  currentStage,
  availableStages,
  onTransition,
  isLoading = false,
}) => {
  const [selectedStage, setSelectedStage] = useState<string>('');
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);

  const nextStages = availableStages.slice(
    availableStages.indexOf(currentStage) + 1
  );

  const handleTransition = async () => {
    if (!selectedStage) return;

    setIsTransitioning(true);
    try {
      await onTransition(selectedStage, notes || undefined);
      setSelectedStage('');
      setNotes('');
      setShowNotes(false);
    } finally {
      setIsTransitioning(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border border-gray-200">
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">
          Current Stage
        </p>
        <p className="text-lg font-semibold text-gray-900">{currentStage}</p>
      </div>

      {nextStages.length > 0 && (
        <>
          <div className="mb-4">
            <label htmlFor="stage-select" className="block text-sm font-medium text-gray-700 mb-2">
              Move to
            </label>
            <select
              id="stage-select"
              value={selectedStage}
              onChange={(e) => {
                setSelectedStage(e.target.value);
                setShowNotes(false);
                setNotes('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a stage...</option>
              {nextStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          {selectedStage && (
            <>
              {!showNotes && (
                <button
                  onClick={() => setShowNotes(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium mb-3"
                >
                  + Add notes
                </button>
              )}

              {showNotes && (
                <div className="mb-4">
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes..."
                    className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              )}

              <button
                onClick={handleTransition}
                disabled={isLoading || isTransitioning}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition"
              >
                Move to {selectedStage}
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </>
      )}

      {nextStages.length === 0 && (
        <p className="text-sm text-gray-600">No more stages available.</p>
      )}
    </div>
  );
};
