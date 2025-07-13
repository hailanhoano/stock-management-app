import React, { useEffect, useState } from 'react';

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
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        onClose?.();
      }, 300);
    }, finalDuration);

    return () => {
      clearTimeout(timer);
    };
  }, []); // Only run once on mount

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
    <div className={`transition-all duration-300 ${
      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
    }`}>
      <div className={`border rounded-lg p-4 shadow-lg max-w-sm ${getTypeStyles()}`}>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 text-lg font-bold">
            {getIcon()}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{message}</p>
          </div>
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(() => onClose?.(), 300);
            }}
            className="flex-shrink-0 text-lg opacity-70 hover:opacity-100"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};

export default Notification; 