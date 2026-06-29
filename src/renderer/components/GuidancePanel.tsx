import React from 'react';
import { GuidanceDoc, GuidanceType } from '../../shared/types';

interface GuidancePanelProps {
  guidanceDocs: GuidanceDoc[];
}

const typeLabels: Record<GuidanceType, string> = {
  interview_prep: 'Interview Preparation',
  company_research: 'Company Research',
  application_strategy: 'Application Strategy',
  follow_up_template: 'Follow-up Template',
};

export const GuidancePanel: React.FC<GuidancePanelProps> = ({ guidanceDocs }) => {
  if (guidanceDocs.length === 0) {
    return (
      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 flex items-center justify-center">
        <p className="text-gray-600">No guidance available for this stage yet.</p>
      </div>
    );
  }

  // Group guidance docs by type
  const groupedByType = guidanceDocs.reduce((acc, doc) => {
    if (!acc[doc.guidance_type]) {
      acc[doc.guidance_type] = [];
    }
    acc[doc.guidance_type].push(doc);
    return acc;
  }, {} as Record<GuidanceType, GuidanceDoc[]>);

  return (
    <div className="space-y-4">
      {(Object.entries(groupedByType) as Array<[GuidanceType, GuidanceDoc[]]>).map(
        ([type, docs]) => (
          <div
            key={type}
            className="bg-blue-50 p-6 rounded-lg border border-blue-200"
          >
            <h3 className="font-semibold text-blue-900 mb-3">
              {typeLabels[type]}
            </h3>
            <div className="space-y-3">
              {docs.map((doc) => (
                <div key={doc.id} className="text-sm text-gray-700">
                  <p className="whitespace-pre-wrap">{doc.content}</p>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};
