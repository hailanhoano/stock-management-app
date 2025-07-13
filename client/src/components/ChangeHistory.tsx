import React, { useState, useEffect } from 'react';

interface ChangeEntry {
  timestamp: number;
  userId: string;
  userEmail: string;
  action: string;
  rowId: string;
  oldValue?: { [key: string]: any };
  newValue?: { [key: string]: any };
  changedFields?: { [key: string]: { old?: any; new?: any; original?: any; current?: any; fieldName: string } };
  metadata?: string[];
}

interface ChangeHistoryProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangeHistory: React.FC<ChangeHistoryProps> = ({ isOpen, onClose }) => {
  const [changes, setChanges] = useState<ChangeEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchChanges = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/stock/change-log?limit=50', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      // Remove duplicates based on timestamp, userId, rowId, and action
      const uniqueChanges = (data.changes || []).filter((change: ChangeEntry, index: number, self: ChangeEntry[]) => {
        return index === self.findIndex(c => 
          c.timestamp === change.timestamp &&
          c.userId === change.userId &&
          c.rowId === change.rowId &&
          c.action === change.action
        );
      });
      
      setChanges(uniqueChanges);
    } catch (error) {
      console.error('Error fetching changes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchChanges();
    }
  }, [isOpen]);

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('vi-VN');
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'UPDATE':
        return 'Cập nhật';
      case 'ADD':
        return 'Thêm mới';
      case 'DELETE':
        return 'Xóa';
      case 'CONFLICT_DETECTED':
        return 'Xung đột';
      default:
        return action;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Lịch sử thay đổi
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Đang tải...</p>
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[60vh]">
            {changes.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Không có thay đổi nào</p>
            ) : (
              <div className="space-y-3">
                {changes.map((change, index) => (
                  <div key={`${change.timestamp}-${change.userId}-${change.rowId}-${change.action}`} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          change.action === 'UPDATE' ? 'bg-green-100 text-green-800' :
                          change.action === 'ADD' ? 'bg-blue-100 text-blue-800' :
                          change.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                          change.action === 'CONFLICT_DETECTED' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getActionLabel(change.action)}
                        </span>
                        <span className="text-sm text-gray-600">
                          Hàng {change.rowId}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(change.timestamp)}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-700">
                      <span className="font-medium">{change.userEmail}</span>
                      {change.metadata && change.metadata.length >= 3 && (
                        <span className="text-gray-500 ml-2">
                          (v{change.metadata[2] || 'N/A'})
                        </span>
                      )}
                    </div>
                    
                    {change.action === 'ADD' && change.changedFields && Object.keys(change.changedFields).length > 0 && (
                      <div className="mt-2 text-xs text-gray-600">
                        <div className="space-y-2">
                          <span className="font-medium text-gray-700">Thêm mới:</span>
                          {Object.entries(change.changedFields).map(([key, field]) => (
                            <div key={key} className="flex items-center gap-2 p-2 bg-blue-50 rounded">
                              <div className="flex-1">
                                <span className="font-medium text-gray-700">{field.fieldName}:</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-green-600 font-medium">{String(field.new || '')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {change.action === 'DELETE' && change.oldValue && (
                      <div className="mt-2 text-xs text-gray-600">
                        <div className="space-y-2">
                          <span className="font-medium text-gray-700">Đã xóa:</span>
                          <div className="p-2 bg-red-50 rounded">
                            <span className="text-red-600">Dòng {change.rowId} đã được xóa</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {change.action === 'UPDATE' && change.changedFields && Object.keys(change.changedFields).length > 0 && (
                      <div className="mt-2 text-xs text-gray-600">
                        <div className="space-y-2">
                          <span className="font-medium text-gray-700">Thay đổi:</span>
                          {Object.entries(change.changedFields).map(([key, field]) => (
                            <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                              <div className="flex-1">
                                <span className="font-medium text-gray-700">{field.fieldName}:</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-red-600 line-through">{String(field.old || field.original || '')}</span>
                                <span className="text-gray-400">→</span>
                                <span className="text-green-600 font-medium">{String(field.new || field.current || '')}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChangeHistory; 