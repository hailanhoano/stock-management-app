import React, { useEffect, useState, useCallback } from 'react';

interface NotificationProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  onClose?: () => void;
}

const Notification: React.FC<NotificationProps> = ({ 
  message, 
  type, 
  duration, 
  onClose 
}) => {
  // Set default duration based on type
  const defaultDuration = type === 'success' ? 3000 : 
                         type === 'error' ? 8000 : 
                         type === 'warning' ? 5000 : 
                         4000;
  
  const finalDuration = duration || defaultDuration;
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onClose?.();
    }, 300);
  }, [onClose]);

  useEffect(() => {
    // Start with slide-in animation
    const showTimer = setTimeout(() => {
      setIsVisible(true);
    }, 100);

    // Auto-hide after duration
    const hideTimer = setTimeout(() => {
      handleClose();
    }, finalDuration);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [finalDuration, handleClose]); // Include dependencies

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-100 border-green-400 text-green-800';
      case 'error':
        return 'bg-red-100 border-red-400 text-red-800';
      case 'warning':
        return 'bg-yellow-100 border-yellow-400 text-yellow-800';
      case 'info':
        return 'bg-blue-100 border-blue-400 text-blue-800';
      default:
        return 'bg-gray-100 border-gray-400 text-gray-800';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return '✓';
      case 'error':
        return '✕';
      case 'warning':
        return '⚠';
      case 'info':
        return 'ℹ';
      default:
        return '•';
    }
  };

  return (
    <div 
      className={`transition-all duration-300 ease-out transform ${
        isVisible && !isExiting 
          ? 'translate-x-0 opacity-100' 
          : 'translate-x-full opacity-0'
      }`}
      style={{
        transform: isVisible && !isExiting ? 'translateX(0)' : 'translateX(100%)',
        opacity: isVisible && !isExiting ? 1 : 0
      }}
    >
      <div className={`border rounded-lg p-4 shadow-lg max-w-sm ${getTypeStyles()}`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-lg font-bold">
            {getIcon()}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{message}</p>
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 text-lg opacity-70 hover:opacity-100 transition-opacity"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};

export default Notification; 