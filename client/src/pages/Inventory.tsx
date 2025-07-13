import React, { useState, useCallback, useEffect } from 'react';
import { useStock } from '../context/StockContext';
import ChangeHistory from '../components/ChangeHistory';
import Notification from '../components/Notification';

interface StockItem {
  id: string;
  name?: string;
  quantity?: number;
  price?: number;
  category?: string;
  min_quantity?: number;
  supplier?: string;
  last_updated?: string;
  brand?: string;
  product_code?: string;
  product_name?: string;
  lot_number?: string;
  date?: string;
  unit?: string;
  expiry_date?: string;
  import_date?: string;
  location?: string;
  warehouse?: string;
  notes?: string;
}

interface NotificationItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

const Inventory: React.FC = () => {
  const { state, fetchInventory } = useStock();
  const [visibleInventory, setVisibleInventory] = useState<StockItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedItem, setEditedItem] = useState<StockItem | null>(null);
  const [newItem, setNewItem] = useState<Partial<StockItem>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [sortField, setSortField] = useState<keyof StockItem>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showChangeHistory, setShowChangeHistory] = useState(false);
  const [showConflictDialog, setShowConflictDialog] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Load inventory data when component mounts
  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Sync local state with context state
  useEffect(() => {
    if (state.inventory.length > 0) {
      setVisibleInventory(state.inventory);
    }
  }, [state.inventory]);

  // Filter inventory based on search term
  const filteredInventory = visibleInventory.filter(item => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return Object.values(item).some(value => 
      value && String(value).toLowerCase().includes(searchLower)
    );
  });

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
    notes: 'Ghi chú',
    name: 'Tên',
    price: 'Giá',
    category: 'Danh mục',
    min_quantity: 'Số lượng tối thiểu',
    supplier: 'Nhà cung cấp',
    last_updated: 'Cập nhật lần cuối'
  };

  // Sort inventory data
  const sortedInventory = [...filteredInventory].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (aValue === undefined && bValue === undefined) return 0;
    if (aValue === undefined) return sortDirection === 'asc' ? -1 : 1;
    if (bValue === undefined) return sortDirection === 'asc' ? 1 : -1;
    
    const comparison = String(aValue).localeCompare(String(bValue));
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  // Add notification
  const addNotification = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, message, type }]);
  }, []);

  // Remove notification
  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Refresh page data
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchInventory();
      addNotification('Đã làm mới dữ liệu', 'success');
    } catch (error) {
      addNotification('Lỗi khi làm mới dữ liệu', 'error');
    } finally {
      setIsRefreshing(false);
    }
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
        
        addNotification('Lưu thành công', 'success');
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
      addNotification('Lỗi khi lưu dữ liệu', 'error');
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

  const handleConflictResolve = async (useServerData: boolean) => {
    if (!editedItem) return;
    
    try {
      const token = localStorage.getItem('token');
      
      if (useServerData) {
        // Use server data
        const response = await fetch(`/api/stock/inventory/${editedItem.id}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await response.json();
        
        if (data.success) {
          setVisibleInventory(prevInventory => 
            prevInventory.map(item => 
              item.id === editedItem.id ? data.data : item
            )
          );
        }
      } else {
        // Use local data - force save
        const response = await fetch(`/api/stock/inventory/${editedItem.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(editedItem)
        });
        
        const data = await response.json();
        
        if (data.success) {
          setVisibleInventory(prevInventory => 
            prevInventory.map(item => 
              item.id === editedItem.id ? editedItem : item
            )
          );
        }
      }
      
      setEditingId(null);
      setEditedItem(null);
      setShowConflictDialog(false);
      addNotification('Xung đột đã được giải quyết', 'success');
    } catch (error) {
      console.error('Error resolving conflict:', error);
      addNotification('Lỗi khi giải quyết xung đột', 'error');
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
    setShowAddForm(true);
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
        setVisibleInventory(prev => [...prev, data.data]);
        setShowAddForm(false);
        setNewItem({});
        addNotification('Thêm mục thành công', 'success');
      } else {
        addNotification('Lỗi khi thêm mục', 'error');
      }
    } catch (error) {
      console.error('Error adding item:', error);
      addNotification('Lỗi khi thêm mục', 'error');
    }
  };

  const handleAddCancel = () => {
    setShowAddForm(false);
    setNewItem({});
  };

  const handleDelete = async (item: StockItem) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa mục này?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/stock/inventory/${item.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setVisibleInventory(prev => prev.filter(i => i.id !== item.id));
        addNotification('Xóa mục thành công', 'success');
      } else {
        addNotification('Lỗi khi xóa mục', 'error');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      addNotification('Lỗi khi xóa mục', 'error');
    }
  };

  const handleNewItemChange = (field: keyof StockItem, value: string) => {
    setNewItem(prev => ({ ...prev, [field]: value }));
  };

  const handleSort = (field: keyof StockItem) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: keyof StockItem) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  };

  const renderCell = (item: StockItem, field: keyof StockItem) => {
    if (editingId === item.id && editedItem) {
      return (
        <input
          type="text"
          value={editedItem[field] || ''}
          onChange={(e) => handleInputChange(field, e.target.value)}
          onKeyPress={handleKeyPress}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        />
      );
    }
    return <span className="text-sm">{item[field] || ''}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý kho</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quản lý hàng hóa trong kho
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {isRefreshing ? 'Đang làm mới...' : 'Làm mới'}
          </button>
          <button
            onClick={handleAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Thêm mục
          </button>
          <span className="flex items-center gap-1 cursor-pointer" onClick={() => setShowChangeHistory(true)}>
            <span className="text-sm text-gray-600">Lịch sử thay đổi</span>
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Tìm kiếm trong kho..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Xóa
            </button>
          )}
        </div>
        {searchTerm && (
          <div className="mt-2 text-sm text-gray-600">
            Tìm thấy {filteredInventory.length} kết quả
          </div>
        )}
      </div>

      {state.error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{state.error}</div>
            </div>
          </div>
        </div>
      )}

      {state.loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Đang tải...</p>
        </div>
      )}

      {!state.loading && (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {Object.entries(columnHeaders).map(([key, header]) => (
                    <th
                      key={key}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                      onClick={() => handleSort(key as keyof StockItem)}
                    >
                      <div className="flex items-center gap-1">
                        {header}
                        {renderSortIcon(key as keyof StockItem)}
                      </div>
                    </th>
                  ))}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedInventory.map((item, index) => (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-gray-50 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    {Object.keys(columnHeaders).map((field) => (
                      <td key={field} className="px-6 py-4 whitespace-nowrap">
                        {renderCell(item, field as keyof StockItem)}
                      </td>
                    ))}
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
                            className="text-red-600 hover:text-red-900"
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
                            className="text-red-600 hover:text-red-900"
                          >
                            Xóa
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Item Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Thêm mục mới</h3>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(columnHeaders).map(([key, header]) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {header}
                  </label>
                  <input
                    type="text"
                    value={newItem[key as keyof StockItem] || ''}
                    onChange={(e) => handleNewItemChange(key as keyof StockItem, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Nhập ${header.toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={handleAddCancel}
                className="px-4 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={handleAddSave}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Thêm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conflict Dialog */}
      {showConflictDialog && conflictData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Xung đột dữ liệu</h3>
            <p className="text-gray-600 mb-4">
              Dữ liệu đã được thay đổi bởi người khác. Bạn muốn sử dụng dữ liệu nào?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handleConflictResolve(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Dữ liệu server
              </button>
              <button
                onClick={() => handleConflictResolve(false)}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Dữ liệu của tôi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map((notification) => (
          <Notification
            key={notification.id}
            message={notification.message}
            type={notification.type}
            onClose={() => removeNotification(notification.id)}
          />
        ))}
      </div>

      {/* Change History Modal */}
      <ChangeHistory
        isOpen={showChangeHistory}
        onClose={() => setShowChangeHistory(false)}
      />
    </div>
  );
};

export default Inventory; 