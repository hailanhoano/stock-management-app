import React from 'react';

interface EditingSession {
  userEmail: string;
  startTime: number;
}

interface EditingIndicatorProps {
  editingSessions: { [key: string]: EditingSession };
  currentUserEmail?: string;
}

const EditingIndicator: React.FC<EditingIndicatorProps> = ({ editingSessions, currentUserEmail }) => {
  const activeSessions = Object.entries(editingSessions).filter(([_, session]) => 
    session.userEmail !== currentUserEmail
  );

  if (activeSessions.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-sm">
      <h4 className="text-sm font-medium text-gray-900 mb-2">
        Đang chỉnh sửa ({activeSessions.length})
      </h4>
      <div className="space-y-2">
        {activeSessions.map(([rowId, session]) => (
          <div key={rowId} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
            <span className="text-gray-600">
              {session.userEmail} - Hàng {rowId}
            </span>
            <span className="text-gray-400">
              ({Math.floor((Date.now() - session.startTime) / 1000)}s)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EditingIndicator; 