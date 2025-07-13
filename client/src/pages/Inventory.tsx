import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../context/WebSocketContext';

interface InventoryItem {
  id: string;
  brand: string;
  product_code: string;
  product_name: string;
  lot_number: string;
  date: string;
  quantity: string;
  unit: string;
  expiry_date: string;
  import_date: string;
  location: string;
  warehouse: string;
  notes: string;
}



const Inventory: React.FC = () => {

  const { isConnected, inventoryUpdates, lastSyncTime, syncStatus, connect } = useWebSocket();
  
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingData, setEditingData] = useState<Partial<InventoryItem>>({});
  const [editingField, setEditingField] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({});
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [googleSheetsChanges, setGoogleSheetsChanges] = useState<number>(0);
  const [lastGoogleSheetsUpdate, setLastGoogleSheetsUpdate] = useState<Date | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof InventoryItem | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });

  // Connect to WebSocket when component mounts
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token && !isConnected) {
      connect(token);
    }
  }, [connect, isConnected]);

  // Add keyboard event listener for editing shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (editingItem && editingField) {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancelEdit();
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [editingItem, editingField]);



  // Load initial inventory data
  const loadInventory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/stock/inventory', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load inventory');
      }

      const data = await response.json();
      setInventory(data.inventory || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial data
  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  // Filter and sort inventory based on search term and sort config
  useEffect(() => {
    let filtered = inventory;
    
    // Apply search filter
    if (searchTerm.trim()) {
      filtered = inventory.filter(item => {
        const searchLower = searchTerm.toLowerCase();
        return (
          item.product_name?.toLowerCase().includes(searchLower) ||
          item.brand?.toLowerCase().includes(searchLower) ||
          item.product_code?.toLowerCase().includes(searchLower) ||
          item.lot_number?.toLowerCase().includes(searchLower) ||
          item.location?.toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Apply sorting
    const sorted = getSortedInventory(filtered);
    setFilteredInventory(sorted);
  }, [inventory, searchTerm, sortConfig]);

  // Handle real-time inventory updates
  useEffect(() => {
    if (inventoryUpdates.length > 0) {
      const latestUpdate = inventoryUpdates[inventoryUpdates.length - 1];
      console.log('🔄 Processing inventory update:', latestUpdate);
      
      switch (latestUpdate.action) {
        case 'ADD':
          // Add new item to the list
          const newItem = {
            ...latestUpdate.data.item,
            id: latestUpdate.data.id
          };
          console.log('➕ Adding new item:', newItem);
          setInventory(prev => [...prev, newItem]);
          break;
          
        case 'DELETE':
          // Remove item from the list
          console.log('🗑️ Removing item from inventory:', latestUpdate.data.id);
          setInventory(prev => {
            const filtered = prev.filter(item => item.id !== latestUpdate.data.id);
            console.log('📊 Inventory after delete - before:', prev.length, 'after:', filtered.length);
            return filtered;
          });
          break;
          
        case 'UPDATE':
          // Update existing item
          setInventory(prev => prev.map(item => 
            item.id === latestUpdate.data.id ? { ...item, ...latestUpdate.data.newData, id: item.id } : item
          ));
          break;
          
        case 'REFRESH':
          // Full refresh from Google Sheets (handles all types of changes)
          if (latestUpdate.data.inventory) {
            console.log('🔄 Received full inventory refresh from Google Sheets');
            setInventory(latestUpdate.data.inventory);
            
            // Show notification if there were changes
            if (latestUpdate.data.changes && latestUpdate.data.changes.length > 0) {
              const changeCount = latestUpdate.data.changes.length;
              const changeTypes = latestUpdate.data.changes.map((c: any) => c.action).join(', ');
              console.log(`📝 Google Sheets changes detected: ${changeCount} changes (${changeTypes})`);
              
              // Update Google Sheets change tracking
              setGoogleSheetsChanges(changeCount);
              setLastGoogleSheetsUpdate(new Date());
              
              // Clear the change count after 5 seconds
              setTimeout(() => {
                setGoogleSheetsChanges(0);
              }, 5000);
            }
          }
          break;
      }
    }
  }, [inventoryUpdates]);

  // Handle form submission for adding new item
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/stock/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newItem),
      });

      if (!response.ok) {
        throw new Error('Failed to add item');
      }

      // Clear form and close modal
      setNewItem({});
      setShowAddForm(false);
      
      // Note: The WebSocket will handle updating the UI automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    }
  };

  // Handle starting inline add mode
  const handleStartAdd = () => {
    setIsAddingItem(true);
    setNewItem({});
  };

  // Handle canceling inline add
  const handleCancelAdd = () => {
    setIsAddingItem(false);
    setNewItem({});
  };

  // Handle saving inline add
  const handleSaveAdd = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/stock/inventory', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(newItem),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to add item');
      }

      // Clear form and hide it
      setNewItem({});
      setIsAddingItem(false);
      
      // Note: The WebSocket will handle updating the UI automatically
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    }
  };

  // Handle item deletion
  const handleDeleteItem = async (id: string) => {
    try {
      setDeletingItem(id);
      
      // Add a 2-second delay to prevent rapid deletions and race conditions
      console.log('⏳ Adding 2-second delay before delete to prevent race conditions...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/stock/inventory/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Delete failed:', errorData);
        
        if (errorData.message === 'Item not found' || errorData.message === 'Item not found - please try again') {
          // If item not found, it might be due to outdated row indices
          // Refresh the inventory data to get updated row indices
          console.log('🔄 Item not found, refreshing inventory data...');
          await loadInventory();
          throw new Error('Item not found - please try deleting again');
        }
        
        throw new Error(errorData.message || 'Failed to delete item');
      }

      console.log('🗑️ Delete request sent for item:', id);
      // Note: The WebSocket will handle updating the UI automatically
    } catch (err) {
      console.error('❌ Error deleting item:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete item');
    } finally {
      setDeletingItem(null);
    }
  };

  // Handle starting edit mode for a specific field
  const handleStartEdit = (item: InventoryItem, field: keyof InventoryItem) => {
    // If we're already editing a different field, save it first
    if (editingItem && editingField && (editingItem.id !== item.id || editingField !== field)) {
      // Save the current edit before starting a new one
      handleSaveEdit().then(() => {
        // After saving, start editing the new field
        setEditingItem(item);
        setEditingField(field);
        setEditingData({
          brand: item.brand,
          product_code: item.product_code,
          product_name: item.product_name,
          lot_number: item.lot_number,
          quantity: item.quantity,
          unit: item.unit,
          expiry_date: item.expiry_date,
          location: item.location,
          warehouse: item.warehouse,
          notes: item.notes
        });
      });
    } else {
      // No current edit, start editing immediately
      setEditingItem(item);
      setEditingField(field);
      setEditingData({
        brand: item.brand,
        product_code: item.product_code,
        product_name: item.product_name,
        lot_number: item.lot_number,
        quantity: item.quantity,
        unit: item.unit,
        expiry_date: item.expiry_date,
        location: item.location,
        warehouse: item.warehouse,
        notes: item.notes
      });
    }
  };

  // Handle canceling edit
  const handleCancelEdit = () => {
    setEditingItem(null);
    setEditingField(null);
    setEditingData({});
  };

  // Handle saving edit
  const handleSaveEdit = useCallback(async () => {
    if (!editingItem) return Promise.resolve();

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/stock/inventory/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(editingData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update item');
      }

      // Clear edit state
      setEditingItem(null);
      setEditingField(null);
      setEditingData({});
      
      // Note: The WebSocket will handle updating the UI automatically
      return Promise.resolve();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
      return Promise.reject(err);
    }
  }, [editingItem, editingData]);



  // Handle clicking outside to save
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (editingItem && editingField) {
      const target = event.target as HTMLElement;
      
      // Don't save if clicking on the same input field
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      
      // Don't save if clicking on action buttons (delete, etc.)
      if (target.closest('button')) {
        return;
      }
      
      // Don't save if clicking on any editable cell div (let the cell's own click handler handle it)
      const clickedEditableDiv = target.closest('div[title="Click to edit"]');
      if (clickedEditableDiv) {
        // If clicking on a different editable cell, let the click handler process it
        return;
      }
      
      // Save when clicking outside any editable cell
      handleSaveEdit();
    }
  }, [editingItem, editingField, handleSaveEdit]);

  // Add click outside listener
  useEffect(() => {
    if (editingItem && editingField) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [editingItem, editingField, handleClickOutside]);

  // Sorting functions
  const handleSort = (key: keyof InventoryItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    
    setSortConfig({ key, direction });
  };

  const getSortedInventory = (inventory: InventoryItem[]) => {
    if (!sortConfig.key) return inventory;

    return [...inventory].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];
      
      // Handle null/undefined values
      if (!aValue && !bValue) return 0;
      if (!aValue) return 1;
      if (!bValue) return -1;
      
      // Convert to string for comparison
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      
      if (sortConfig.direction === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });
  };

  const getSortIcon = (key: keyof InventoryItem) => {
    if (sortConfig.key !== key) {
      return '↕️'; // Neutral sort icon
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Render editable cell content
  const renderEditableCell = (item: InventoryItem, field: keyof InventoryItem, value: string, className: string = '') => {
    const isEditing = editingItem?.id === item.id && editingField === field;
    
    if (isEditing) {
      const inputType = field === 'quantity' ? 'number' : 
                       field === 'expiry_date' ? 'date' : 'text';
      
      return (
        <input
          type={inputType}
          value={editingData[field] || ''}
          onChange={(e) => setEditingData({...editingData, [field]: e.target.value})}
          className={`w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${className}`}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSaveEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              handleCancelEdit();
            }
          }}
        />
      );
    }
    
    return (
      <div 
        className={`cursor-pointer hover:bg-blue-50 px-2 py-1 rounded transition-colors ${className}`}
        onClick={(e) => {
          e.stopPropagation();
          handleStartEdit(item, field);
        }}
        title="Click to edit"
      >
        {value || ''}
      </div>
    );
  };

  // Render editable textarea for product name
  const renderEditableTextarea = (item: InventoryItem, field: keyof InventoryItem, value: string) => {
    const isEditing = editingItem?.id === item.id && editingField === field;
    
    if (isEditing) {
      return (
        <textarea
          value={editingData[field] || ''}
          onChange={(e) => setEditingData({...editingData, [field]: e.target.value})}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          rows={2}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSaveEdit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              handleCancelEdit();
            }
          }}
        />
      );
    }
    
    return (
      <div 
        className="break-words leading-tight cursor-pointer hover:bg-blue-50 px-2 py-1 rounded transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          handleStartEdit(item, field);
        }}
        title="Click to edit"
      >
        {value || ''}
      </div>
    );
  };

  // Render quantity and unit together
  const renderQuantityCell = (item: InventoryItem) => {
    const isEditing = editingItem?.id === item.id && editingField === 'quantity';
    
    if (isEditing) {
      return (
        <div className="flex space-x-1">
          <input
            type="number"
            value={editingData.quantity || ''}
            onChange={(e) => setEditingData({...editingData, quantity: e.target.value})}
            className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelEdit();
              }
            }}
          />
          <input
            type="text"
            value={editingData.unit || ''}
            onChange={(e) => setEditingData({...editingData, unit: e.target.value})}
            className="w-12 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="unit"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelEdit();
              }
            }}
          />
        </div>
      );
    }
    
    return (
      <div 
        className="cursor-pointer hover:bg-blue-50 px-2 py-1 rounded transition-colors"
        onClick={(e) => {
          e.stopPropagation();
          handleStartEdit(item, 'quantity');
        }}
        title="Click to edit"
      >
        {`${item.quantity} ${item.unit}`}
      </div>
    );
  };

  // Render inline add row
  const renderAddRow = () => {
    if (!isAddingItem) {
      return (
        <tr className="bg-blue-50 hover:bg-blue-100 transition-colors duration-150">
          <td colSpan={7} className="px-6 py-4">
            <button
              onClick={handleStartAdd}
              className="flex items-center space-x-2 text-blue-600 hover:text-blue-800 font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Add New Item</span>
            </button>
          </td>
        </tr>
      );
    }

    return (
      <tr className="bg-green-50 border-2 border-green-200">
        <td className="px-6 py-4">
          <input
            type="text"
            placeholder="Brand"
            value={newItem.brand || ''}
            onChange={(e) => setNewItem({...newItem, brand: e.target.value})}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveAdd();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelAdd();
              }
            }}
          />
        </td>
        <td className="px-6 py-4">
          <input
            type="text"
            placeholder="Product Code"
            value={newItem.product_code || ''}
            onChange={(e) => setNewItem({...newItem, product_code: e.target.value})}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveAdd();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelAdd();
              }
            }}
          />
        </td>
        <td className="px-6 py-4">
          <textarea
            placeholder="Product Name"
            value={newItem.product_name || ''}
            onChange={(e) => setNewItem({...newItem, product_name: e.target.value})}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSaveAdd();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelAdd();
              }
            }}
          />
        </td>
        <td className="px-6 py-4">
          <div className="flex space-x-1">
            <input
              type="number"
              placeholder="Qty"
              value={newItem.quantity || ''}
              onChange={(e) => setNewItem({...newItem, quantity: e.target.value})}
              className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveAdd();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancelAdd();
                }
              }}
            />
            <input
              type="text"
              placeholder="Unit"
              value={newItem.unit || ''}
              onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
              className="w-12 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveAdd();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  handleCancelAdd();
                }
              }}
            />
          </div>
        </td>
        <td className="px-6 py-4">
          <input
            type="text"
            placeholder="Location"
            value={newItem.location || ''}
            onChange={(e) => setNewItem({...newItem, location: e.target.value})}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveAdd();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelAdd();
              }
            }}
          />
        </td>
        <td className="px-6 py-4">
          <input
            type="date"
            placeholder="Expiry Date"
            value={newItem.expiry_date || ''}
            onChange={(e) => setNewItem({...newItem, expiry_date: e.target.value})}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSaveAdd();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelAdd();
              }
            }}
          />
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex space-x-2">
            <button
              onClick={handleSaveAdd}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              Save
            </button>
            <button
              onClick={handleCancelAdd}
              className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-400"
            >
              Cancel
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
      <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
        <p className="mt-1 text-sm text-gray-500">
            Real-time inventory tracking with live updates
        </p>
      </div>

        {/* Connection Status */}
                  <div className="mt-4 sm:mt-0 flex items-center space-x-4">
            <div className="flex flex-col space-y-1 text-sm relative">
              {/* Row 1: Last sync timestamp */}
              <div className="text-xs text-gray-500">
                Last sync: {lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Unknown'}
                {syncStatus === 'syncing' && <span className="ml-2 text-blue-600">🔄</span>}
                {syncStatus === 'error' && <span className="ml-2 text-red-600">❌</span>}
              </div>
              
              {/* Row 2: Live Updates Active */}
              <div className="flex items-center space-x-2">
                <span className="text-green-500">●</span>
                <span className="text-green-600 font-medium">Live Updates Active</span>
              </div>
              
              {/* Row 3: Google Sheets changes - positioned absolutely to avoid layout shifts */}
              <div className={`absolute top-full left-0 transition-all duration-300 ease-in-out ${
                googleSheetsChanges > 0 
                  ? 'opacity-100 transform translate-y-0' 
                  : 'opacity-0 transform -translate-y-2 pointer-events-none'
              }`}>
                <div className="text-xs text-orange-500 animate-pulse bg-white px-2 py-1 rounded shadow-sm whitespace-nowrap">
                  📊 {googleSheetsChanges} Google Sheets changes
                </div>
              </div>
            </div>
          

        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Changes Indicator - Disabled */}
      {/* {recentChanges.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Recent Activity</h3>
              <div className="mt-2 text-sm text-blue-700">
                {recentChanges.slice(-3).map((change, index) => (
                  <div key={index} className="mt-1">
                    <span className="font-medium">{change.userEmail}</span> {change.action.toLowerCase()}d item {change.rowId}
                  </div>
                ))}
              </div>
            </div>
                        </div>
                      </div>
      )} */}

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex gap-4 items-center">
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search by product name, brand, code, lot number, or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
                        </div>
                        <div className="text-sm text-gray-500">
            {filteredInventory.length} of {inventory.length} items
                        </div>
                      </div>
                    </div>

      {/* Inventory Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('brand')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Brand</span>
                    <span className="text-xs">{getSortIcon('brand')}</span>
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('product_code')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Product Code</span>
                    <span className="text-xs">{getSortIcon('product_code')}</span>
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/3 cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('product_name')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Product Name</span>
                    <span className="text-xs">{getSortIcon('product_name')}</span>
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('quantity')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Quantity</span>
                    <span className="text-xs">{getSortIcon('quantity')}</span>
                        </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('location')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Location</span>
                    <span className="text-xs">{getSortIcon('location')}</span>
                        </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('expiry_date')}
                >
                  <div className="flex items-center space-x-1">
                    <span>Expiry Date</span>
                    <span className="text-xs">{getSortIcon('expiry_date')}</span>
                      </div>
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                  {editingItem && (
                    <span className="ml-2 text-xs text-blue-600 font-normal">
                      (Press Ctrl+Enter to save, Esc to cancel)
                    </span>
                  )}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Inline Add Row */}
              {renderAddRow()}
              
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center">
                    <div className="text-gray-500">
                      {searchTerm ? (
                        <div>
                          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <p className="mt-2 text-sm font-medium">No items found</p>
                          <p className="mt-1 text-xs">Try adjusting your search terms</p>
                        </div>
                      ) : (
                        <div>
                          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                          </svg>
                          <p className="mt-2 text-sm font-medium">No inventory items</p>
                          <p className="mt-1 text-xs">Add your first item to get started</p>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item, index) => (
                  <tr key={item.id} data-item-id={item.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'} hover:bg-blue-50 transition-colors duration-150`}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" data-field="brand">
                      {renderEditableCell(item, 'brand', item.brand)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="product_code">
                      {renderEditableCell(item, 'product_code', item.product_code)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 w-1/3" data-field="product_name">
                      {renderEditableTextarea(item, 'product_name', item.product_name)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="quantity">
                      {renderQuantityCell(item)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="location">
                      {renderEditableCell(item, 'location', item.location)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="expiry_date">
                      {renderEditableCell(item, 'expiry_date', item.expiry_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex space-x-2 justify-end">
                        <button
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={deletingItem === item.id}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          title={deletingItem === item.id ? 'Deleting (2s delay)...' : 'Delete item'}
                        >
                          {deletingItem === item.id ? '⏳ Deleting...' : '🗑️ Delete'}
                        </button>
                  </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Item Modal */}
      {showAddForm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Add New Item</h3>
              <form onSubmit={handleAddItem} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Brand</label>
                  <input
                    type="text"
                    value={newItem.brand || ''}
                    onChange={(e) => setNewItem({...newItem, brand: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Product Code</label>
                  <input
                    type="text"
                    value={newItem.product_code || ''}
                    onChange={(e) => setNewItem({...newItem, product_code: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Product Name</label>
                  <input
                    type="text"
                    value={newItem.product_name || ''}
                    onChange={(e) => setNewItem({...newItem, product_name: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Quantity</label>
                  <input
                    type="number"
                    value={newItem.quantity || ''}
                    onChange={(e) => setNewItem({...newItem, quantity: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit</label>
                  <input
                    type="text"
                    value={newItem.unit || ''}
                    onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Location</label>
                  <input
                    type="text"
                    value={newItem.location || ''}
                    onChange={(e) => setNewItem({...newItem, location: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Expiry Date</label>
                  <input
                    type="date"
                    value={newItem.expiry_date || ''}
                    onChange={(e) => setNewItem({...newItem, expiry_date: e.target.value})}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Add Item
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory; 