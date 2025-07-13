import React, { useEffect, useState, useCallback } from 'react';
import { useStock, StockItem } from '../context/StockContext';
import EditingIndicator from '../components/EditingIndicator';
import ChangeHistory from '../components/ChangeHistory';
import Notification from '../components/Notification';

const Inventory: React.FC = () => {
  const { state, fetchInventory } = useStock();
  // Local state for visible inventory
  const [visibleInventory, setVisibleInventory] = useState<StockItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedItem, setEditedItem] = useState<StockItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof StockItem>('product_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isAdding, setIsAdding] = useState(false);
  const [newItem, setNewItem] = useState<Partial<StockItem>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [hasMultipleUsers, setHasMultipleUsers] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [countdown, setCountdown] = useState(0);
  
  // New state for multi-user features
  const [editingSessions, setEditingSessions] = useState<{[key: string]: {userEmail: string, startTime: number}}>({});
  const [conflictData, setConflictData] = useState<any>(null);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [recentChanges, setRecentChanges] = useState<any[]>([]);
  const [showChangeHistory, setShowChangeHistory] = useState(false);
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    message: string;
    type: 'success' | 'error' | 'warning' | 'info';
  }>>([]);

  // Check active users count
  const checkActiveUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/active-count', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setHasMultipleUsers(data.hasMultipleUsers);
    } catch (error) {
      console.error('Error checking active users:', error);
    }
  };

  // Get editing sessions
  const getEditingSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/stock/editing-sessions', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      if (data.sessions) {
        const sessionsMap: {[key: string]: {userEmail: string, startTime: number}} = {};
        data.sessions.forEach((session: any) => {
          sessionsMap[session.rowId] = {
            userEmail: session.userEmail,
            startTime: session.startTime
          };
        });
        setEditingSessions(sessionsMap);
      }
    } catch (error) {
      console.error('Error getting editing sessions:', error);
    }
  };

  // Get recent changes
  const getRecentChanges = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const since = Date.now() - (5 * 60 * 1000); // Last 5 minutes
      const response = await fetch(`/api/stock/change-log?since=${since}&limit=10`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      
      const newChanges = data.changes || [];
      const previousCount = recentChanges.length;
      
      setRecentChanges(newChanges);
      
      // Show notification for new changes
      if (newChanges.length > previousCount && previousCount > 0) {
        const newChangeCount = newChanges.length - previousCount;
        // Use setNotifications directly to avoid dependency issues
        const id = Date.now().toString();
        setNotifications(prev => [...prev, { id, message: `${newChangeCount} thay đổi mới được phát hiện`, type: 'info' }]);
      }
    } catch (error) {
      console.error('Error getting recent changes:', error);
    }
  }, [recentChanges.length]);

  // Add notification
  const addNotification = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
  };

  // Remove notification
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Disabled countdown timer to prevent visual flashing
  useEffect(() => {
    // Set countdown to a high value to prevent automatic refreshes
    setCountdown(999);
  }, []); // Only run once to disable countdown

  // Disabled countdown reset to prevent visual flashing
  // useEffect(() => {
  //   const interval = 30000; // Always 30 seconds
  //   setCountdown(interval / 1000);
  // }, [lastUpdated]);

  // On initial load only, sync local state
  useEffect(() => {
    if (state.inventory.length > 0 && visibleInventory.length === 0) {
      setVisibleInventory(state.inventory);
    }
  }, [state.inventory, visibleInventory.length]);

  // Silent update - only update data without triggering re-renders
  const updateChangedItems = useCallback((newInventory: StockItem[]) => {
    // Aggressive debounce to prevent any flashing
    const now = Date.now();
    if (now - lastFetchTime < 10000) { // Don't update if last update was less than 10 seconds ago
      return;
    }
    
    setVisibleInventory(prevInventory => {
      if (prevInventory.length === 0) {
        return newInventory;
      }
      
      // Remove duplicates by ID
      const uniqueNewInventory = newInventory.filter((item, index, self) => 
        index === self.findIndex(t => t.id === item.id)
      );
      
      // Strict deep comparison to check if data actually changed
      const hasChanges = prevInventory.length !== uniqueNewInventory.length ||
        prevInventory.some((prevItem, index) => {
          const newItem = uniqueNewInventory[index];
          if (!newItem) return true;
          // Compare each field individually to avoid false positives
          return prevItem.brand !== newItem.brand ||
                 prevItem.product_code !== newItem.product_code ||
                 prevItem.product_name !== newItem.product_name ||
                 prevItem.lot_number !== newItem.lot_number ||
                 prevItem.date !== newItem.date ||
                 prevItem.quantity !== newItem.quantity ||
                 prevItem.unit !== newItem.unit ||
                 prevItem.expiry_date !== newItem.expiry_date ||
                 prevItem.import_date !== newItem.import_date ||
                 prevItem.location !== newItem.location ||
                 prevItem.warehouse !== newItem.warehouse ||
                 prevItem.notes !== newItem.notes;
        });
      
      // Only update if there are actual changes
      if (!hasChanges) {
        return prevInventory; // Return same reference to prevent re-render
      }
      
      // Update silently without triggering visual changes
      return uniqueNewInventory;
    });
  }, [lastFetchTime]);

  useEffect(() => {
    // Initial calls only once
    checkActiveUsers();
    getEditingSessions();
    getRecentChanges();
    
    // Much less frequent background checks - every 60 seconds
    const backgroundInterval = setInterval(async () => {
      const now = Date.now();
      
      // Only run background checks if there are multiple users AND we haven't checked recently AND user is not editing
      if (hasMultipleUsers && now - lastFetchTime > 45000 && !editingId) {
        // Check active users
        await checkActiveUsers();
        
        // Get editing sessions
        await getEditingSessions();
        
        // Get recent changes
        await getRecentChanges();
        
        // Background refresh for inventory data - only if needed
        try {
          const token = localStorage.getItem('token');
          if (!state.spreadsheetIds.inventory) {
            return;
          }
          
          const response = await fetch(`/api/stock/inventory?spreadsheetId=${state.spreadsheetIds.inventory}`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (!response.ok) {
            return;
          }
          
          const data = await response.json();
          
          if (data.success) {
            setLastUpdated(new Date());
            setLastFetchTime(now);
            // Silent update without visual changes
            updateChangedItems(data.data || data);
          }
        } catch (error) {
          // Silent error for background checks
        }
      }
    }, 60000); // Single 60-second interval for all background operations
    
    return () => {
      clearInterval(backgroundInterval);
    };
  }, [hasMultipleUsers, state.spreadsheetIds.inventory, lastFetchTime]); // Added lastFetchTime to prevent excessive calls

  // Fetch inventory when spreadsheet ID becomes available (only if no data exists)
  useEffect(() => {
    if (state.spreadsheetIds.inventory && state.inventory.length === 0) {
      fetchInventory();
    }
  }, [state.spreadsheetIds.inventory, state.inventory.length]); // Removed fetchInventory dependency

  // Vietnamese column headers mapping
  const columnHeaders: { [key in keyof StockItem]: string } = {
    id: 'ID',
    brand: 'Tên hãng',
    product_code: 'Mã hàng',
    product_name: 'Tên hàng',
    lot_number: 'Số Lot',
    date: 'Ngày',
    quantity: 'Số lượng',
    unit: 'Đơn vị',
    expiry_date: 'Ngày hết hạn',
    import_date: 'Ngày nhập kho',
    location: 'Vị trí đặt hàng',
    warehouse: 'Tên Kho',
    notes: 'Ghi chú'
  };

  const handleEdit = async (item: StockItem) => {
    try {
      const token = localStorage.getItem('token');
      
      // Start editing session
      const response = await fetch(`/api/stock/inventory/${item.id}/start-edit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setEditingId(item.id);
        setEditedItem({ ...item });
      } else if (response.status === 409) {
        // Another user is editing this item
        addNotification(`${data.editingUser} đang chỉnh sửa mục này`, 'warning');
      } else {
        console.error('Failed to start editing session:', data.message);
        addNotification('Không thể bắt đầu chỉnh sửa', 'error');
      }
    } catch (error) {
      console.error('Error starting edit session:', error);
    }
  };

  const handleSave = async () => {
    if (!editedItem) return;
    
    try {
      const token = localStorage.getItem('token');
      console.log('Saving item:', editedItem);
      console.log('Token:', token ? 'Present' : 'Missing');
      
      const response = await fetch(`/api/stock/inventory/${editedItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editedItem)
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        // Update only the specific row in local state to prevent flash
        setVisibleInventory(prevInventory => 
          prevInventory.map(item => 
            item.id === editedItem.id ? editedItem : item
          )
        );
        setEditingId(null);
        setEditedItem(null);
        
        // End editing session
        await fetch(`/api/stock/inventory/${editedItem.id}/end-edit`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        addNotification('Đã lưu thành công', 'success');
      } else if (response.status === 409) {
        // Conflict detected
        setConflictData(data);
        setShowConflictDialog(true);
        addNotification('Phát hiện xung đột dữ liệu', 'warning');
      } else {
        console.error('Failed to save item:', data.message);
        addNotification('Lỗi khi lưu dữ liệu', 'error');
      }
    } catch (error) {
      console.error('Error saving item:', error);
      // Removed alert - silent error
    }
  };

  const handleCancel = async () => {
    if (editingId) {
      try {
        const token = localStorage.getItem('token');
        await fetch(`/api/stock/inventory/${editingId}/end-edit`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (error) {
        console.error('Error ending edit session:', error);
      }
    }
    setEditingId(null);
    setEditedItem(null);
  };

  // Conflict resolution handlers
  const handleConflictResolve = async (useServerData: boolean) => {
    if (!conflictData) return;
    
    try {
      const token = localStorage.getItem('token');
      
      if (useServerData) {
        // Use server data, just end the editing session
        await fetch(`/api/stock/inventory/${editingId}/end-edit`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        // Refresh the data to show server version
    fetchInventory();
      } else {
        // Use our data, force the update
        const response = await fetch(`/api/stock/inventory/${editedItem!.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Force-Update': 'true' // Custom header to bypass conflict check
          },
          body: JSON.stringify(editedItem)
        });
        
        if (response.ok) {
          // Update local state
          setVisibleInventory(prevInventory => 
            prevInventory.map(item => 
              item.id === editedItem!.id ? editedItem! : item
            )
          );
        }
      }
      
      setShowConflictDialog(false);
      setConflictData(null);
      setEditingId(null);
      setEditedItem(null);
    } catch (error) {
      console.error('Error resolving conflict:', error);
    }
  };

  const handleInputChange = (field: keyof StockItem, value: string) => {
    if (editedItem) {
      setEditedItem({ ...editedItem, [field]: value });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleAdd = () => {
    setIsAdding(true);
    setNewItem({});
  };

  const handleAddSave = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const response = await fetch('/api/stock/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newItem)
      });

      const data = await response.json();

      if (data.success) {
        // Add the new item to local state to prevent flash
        const newItemWithId = { ...newItem, id: data.id };
        setVisibleInventory(prevInventory => [...prevInventory, newItemWithId]);
        setIsAdding(false);
        setNewItem({});
        addNotification('Đã thêm sản phẩm thành công', 'success');
      } else {
        console.error('Failed to add item:', data.message);
        addNotification('Lỗi khi thêm sản phẩm', 'error');
      }
    } catch (error) {
      console.error('Error adding item:', error);
    }
  };

  const handleAddCancel = () => {
    setIsAdding(false);
    setNewItem({});
  };

  const handleDelete = async (item: StockItem) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) {
      return;
    }

    try {
      setDeletingId(item.id);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`/api/stock/inventory/${item.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        // Remove the item from local state to prevent flash
        setVisibleInventory(prevInventory => 
          prevInventory.filter(invItem => invItem.id !== item.id)
        );
      } else {
        console.error('Failed to delete item:', data.message);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleNewItemChange = (field: keyof StockItem, value: string) => {
    setNewItem({ ...newItem, [field]: value });
  };

  const handleSort = (field: keyof StockItem) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedInventory = visibleInventory
    .filter((item: StockItem) => {
      const searchLower = searchTerm.toLowerCase();
      return (
        item.product_name?.toLowerCase().includes(searchLower) ||
        item.brand?.toLowerCase().includes(searchLower) ||
        item.product_code?.toLowerCase().includes(searchLower) ||
        item.lot_number?.toLowerCase().includes(searchLower) ||
        item.location?.toLowerCase().includes(searchLower)
      );
    })
    .sort((a: StockItem, b: StockItem) => {
      const aValue = a[sortField as keyof StockItem] || '';
      const bValue = b[sortField as keyof StockItem] || '';
      
      if (sortDirection === 'asc') {
        return aValue.toString().localeCompare(bValue.toString());
      } else {
        return bValue.toString().localeCompare(aValue.toString());
      }
    });

  const renderSortIcon = (field: keyof StockItem) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const renderCell = (item: StockItem, field: keyof StockItem) => {
    const isEditing = editingId === item.id;
    const value = isEditing && editedItem ? editedItem[field as keyof StockItem] : item[field as keyof StockItem];

    if (isEditing) {
      return (
        <input
          type="text"
          value={value?.toString() || ''}
          onChange={(e) => handleInputChange(field, e.target.value)}
          onKeyDown={handleKeyPress}
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      );
    }

    if (field === 'quantity') {
      const quantity = parseInt(value?.toString() || '0');
      return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          quantity < 10 
            ? 'bg-red-100 text-red-800' 
            : quantity < 50
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-green-100 text-green-800'
        }`}>
          {value || ''}
        </span>
      );
    }

    // Special handling for product_name to enable text wrapping
    if (field === 'product_name') {
      return <span className="text-sm text-gray-900 break-words whitespace-normal">{value || ''}</span>;
    }

    return <span className="text-sm text-gray-900">{value || ''}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Conflict Resolution Dialog */}
      {showConflictDialog && conflictData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
            <h3 className="text-lg font-semibold text-red-600 mb-4">
              Xung đột dữ liệu phát hiện
            </h3>
            <p className="text-gray-700 mb-4">
              Dữ liệu đã được thay đổi bởi người dùng khác trong khi bạn đang chỉnh sửa. 
              Vui lòng chọn phiên bản nào bạn muốn giữ lại.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2">Dữ liệu của bạn</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  {Object.entries(conflictData.attemptedData).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="font-medium">{columnHeaders[key as keyof StockItem] || key}:</span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="border border-green-200 rounded-lg p-4">
                <h4 className="font-medium text-green-800 mb-2">Dữ liệu hiện tại (Server)</h4>
                <div className="text-sm text-gray-600 space-y-1">
                  {Object.entries(conflictData.serverData).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="font-medium">{columnHeaders[key as keyof StockItem] || key}:</span>
                      <span>{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => handleConflictResolve(true)}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Sử dụng dữ liệu Server
              </button>
              <button
                onClick={() => handleConflictResolve(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Giữ dữ liệu của tôi
              </button>
              <button
                onClick={() => setShowConflictDialog(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center">
      <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý kho</h1>
        <p className="mt-1 text-sm text-gray-500">
            Quản lý và chỉnh sửa dữ liệu kho hàng
          </p>
        </div>
        <div className="text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <span>Tổng số: {filteredAndSortedInventory.length} sản phẩm</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            <span className="flex items-center gap-1">
              <span>Cập nhật lần cuối: {lastUpdated.toLocaleTimeString()}</span>
              <span className="text-blue-400">●</span>
              <span>Kiểm tra nền (30s - <span className="font-mono w-6 inline-block text-right text-xs">{Math.floor(countdown)}s</span>)</span>
            </span>
          </div>
          
          {/* Recent Changes Indicator */}
          {recentChanges.length > 0 && (
            <div className="text-xs text-orange-600 mt-1">
              <span className="flex items-center gap-1 cursor-pointer" onClick={() => setShowChangeHistory(true)}>
                <span className="text-orange-500">●</span>
                <span>{recentChanges.length} thay đổi gần đây</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {!state.spreadsheetIds.inventory && !state.loading && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">Đang tải cấu hình</h3>
              <div className="mt-2 text-sm text-yellow-700">Đang tải cấu hình spreadsheet...</div>
            </div>
          </div>
        </div>
      )}

      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Lỗi</h3>
              <div className="mt-2 text-sm text-red-700">{state.error}</div>
            </div>
          </div>
        </div>
      )}



      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm theo tên hàng, hãng, mã hàng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            + Thêm sản phẩm
          </button>
          <button
            onClick={() => {
              fetchInventory();
              setCountdown(30); // Reset countdown
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Làm mới
          </button>
        </div>
            </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {Object.entries(columnHeaders).map(([key, header]) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key as keyof StockItem)}
                    className={`px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 ${key === 'product_name' ? 'w-1/6 max-w-xs break-words whitespace-normal' : ''}`}
                  >
                    <div className="flex items-center gap-1">
                      {header}
                      {renderSortIcon(key as keyof StockItem)}
            </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Add new item row */}
              {isAdding && (
                <tr className="bg-green-50 border-2 border-green-200">
                  {Object.keys(columnHeaders).map((field) => (
                    <td key={field} className="px-3 py-4 whitespace-nowrap">
                      <input
                        type="text"
                        placeholder={`Nhập ${columnHeaders[field as keyof typeof columnHeaders]}`}
                        value={newItem[field as keyof StockItem]?.toString() || ''}
                        onChange={(e) => handleNewItemChange(field as keyof StockItem, e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                  ))}
                  <td className="px-3 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddSave}
                        className="text-green-600 hover:text-green-900"
                      >
                        Lưu
                      </button>
                      <button
                        onClick={handleAddCancel}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Hủy
                      </button>
                        </div>
                  </td>
                </tr>
              )}
              
              {state.loading ? (
                <tr>
                  <td colSpan={Object.keys(columnHeaders).length + 1} className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-sm text-gray-500">Đang tải dữ liệu...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredAndSortedInventory.length === 0 ? (
                <tr>
                  <td colSpan={Object.keys(columnHeaders).length + 1} className="px-6 py-4 text-center text-sm text-gray-500">
                    {searchTerm ? 'Không tìm thấy sản phẩm nào' : 'Không có dữ liệu kho hàng'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedInventory.map((item: StockItem, index: number) => (
                  <tr key={item.id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {Object.keys(columnHeaders).map((field) => (
                      <td key={field} className={`px-3 py-4 whitespace-nowrap ${field === 'product_name' ? 'w-1/6 max-w-xs break-words whitespace-normal' : ''}`}>
                        {renderCell(item, field as keyof StockItem)}
                      </td>
                    ))}
                    <td className="px-3 py-4 whitespace-nowrap text-sm font-medium">
                      {editingId === item.id ? (
                        <div className="flex gap-2">
                          <button
                            onClick={handleSave}
                            className="text-green-600 hover:text-green-900"
                          >
                            Lưu
                          </button>
                          <button
                            onClick={handleCancel}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            disabled={deletingId === item.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {deletingId === item.id ? 'Đang xóa...' : 'Xóa'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Editing Indicator */}
      <EditingIndicator 
        editingSessions={editingSessions}
        currentUserEmail={JSON.parse(localStorage.getItem('user') || '{}').email}
      />
      
      {/* Change History Dialog */}
      <ChangeHistory 
        isOpen={showChangeHistory}
        onClose={() => setShowChangeHistory(false)}
      />
      
      {/* Notifications */}
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          style={{
            position: 'fixed',
            top: `${4 + index * 80}px`,
            right: '16px',
            zIndex: 9999 + index
          }}
        >
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => removeNotification(notification.id)}
          />
        </div>
      ))}
    </div>
  );
};

export default Inventory; 