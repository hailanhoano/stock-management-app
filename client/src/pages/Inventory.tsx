import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { useLocation, useNavigate } from 'react-router-dom';

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
  source?: string; // 'source1' or 'source2' (internal tracking only)
  sourceId?: string; // Combined source and id for unique identification
  targetSource?: string; // For add form - which source to add to
}



const Inventory: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected, inventoryUpdates, lastSyncTime, syncStatus, connect, updateSyncTime, socket } = useWebSocket();
  
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editingData, setEditingData] = useState<Partial<InventoryItem>>({});
  const [editingField, setEditingField] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [isDeletionInProgress, setIsDeletionInProgress] = useState(false);
  const [isBulkDeleteInProgress, setIsBulkDeleteInProgress] = useState(false);

  const [newItem, setNewItem] = useState<Partial<InventoryItem>>({});
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [googleSheetsChanges, setGoogleSheetsChanges] = useState<number>(0);
  const [lastGoogleSheetsUpdate, setLastGoogleSheetsUpdate] = useState<Date | null>(null);
  const lastProcessedUpdateRef = useRef<string>('');
  

  const [searchTerm, setSearchTerm] = useState('');
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [sortConfig, setSortConfig] = useState<{
    key: keyof InventoryItem | null;
    direction: 'asc' | 'desc';
  }>({ key: null, direction: 'asc' });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Add new state for bulk selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkActionMode, setIsBulkActionMode] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [showColumnVisibility, setShowColumnVisibility] = useState(false);
  const [showRelocationTab, setShowRelocationTab] = useState(false);
  const [isRelocating, setIsRelocating] = useState(false);

  // Column visibility state - initialize from localStorage
  const [columnVisibility, setColumnVisibility] = useState(() => {
    const savedVisibility = localStorage.getItem('inventoryColumnVisibility');
    if (savedVisibility) {
      try {
        const parsed = JSON.parse(savedVisibility);
        return parsed;
      } catch (error) {
        console.error('Error loading column visibility preferences:', error);
      }
    }
    // Default visibility
    return {
      checkbox: true,
      brand: true,
      product_code: true,
      product_name: true,
      quantity: true,
      unit: true,
      location: true,
      warehouse: true,
      lot_number: true,
      expiry_date: true,
      import_date: true,
      notes: true,
      actions: true
    };
  });

  // Save selected items to localStorage whenever they change
  useEffect(() => {
    // Only save/clear if component has been initialized
    if (hasInitialized) {
      if (selectedItems.size > 0) {
        localStorage.setItem('inventorySelectedItems', JSON.stringify(Array.from(selectedItems)));
        console.log('💾 Saved selected items to localStorage:', selectedItems.size, 'items');
      } else {
        // Only clear if we're not in the initial loading state
        const currentSaved = localStorage.getItem('inventorySelectedItems');
        if (currentSaved) {
          localStorage.removeItem('inventorySelectedItems');
          console.log('🗑️ Cleared selected items from localStorage');
        }
      }
    }
  }, [selectedItems, hasInitialized]);

  // Load selected items from localStorage on component mount
  useEffect(() => {
    const savedSelectedItems = localStorage.getItem('inventorySelectedItems');
    console.log('🔍 Checking localStorage for saved items:', !!savedSelectedItems);
    if (savedSelectedItems) {
      try {
        const items = JSON.parse(savedSelectedItems);
        console.log('📦 Found saved items:', items.length, 'items');
        setSelectedItems(new Set(items));
        if (items.length > 0) {
          setIsBulkActionMode(true); // Automatically enable bulk mode for restored items
        }
        console.log('✅ Restored selected items from localStorage');
      } catch (error) {
        console.error('❌ Error loading saved selected items:', error);
        localStorage.removeItem('inventorySelectedItems');
      }
    } else {
      console.log('📭 No saved items found in localStorage');
    }
    
    // Mark as initialized after loading
    setHasInitialized(true);
  }, []);

  const location = useLocation();

  // Handle preserved selection from checkout page
  useEffect(() => {
    if (location.state?.preserveSelection && location.state?.selectedItems) {
      const preservedItems = location.state.selectedItems;
      const preservedSet = new Set<string>(preservedItems.map((item: { id: string }) => item.id));
      setSelectedItems(preservedSet);
      if (preservedSet.size > 0) {
        setIsBulkActionMode(true); // Automatically enable bulk mode for preserved items
      }
      
      // Clear the state to prevent re-applying on subsequent renders
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, navigate]);

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
      console.log('📊 Loaded inventory data:', data.inventory?.length || 0, 'items');
      console.log('📋 Sample items:', data.inventory?.slice(0, 3)?.map((item: any) => ({
        id: item.id,
        product_name: item.product_name,
        warehouse: item.warehouse,
        source: item.source
      })));
      console.log('🔍 Full inventory data:', data.inventory?.slice(0, 5));
      
      // Remove duplicates from loaded data
      const uniqueInventory = data.inventory?.filter((item: any, index: number, self: any[]) => 
        index === self.findIndex((t: any) => t.id === item.id)
      ) || [];
      
      if (uniqueInventory.length !== (data.inventory?.length || 0)) {
        console.log('🧹 Removed duplicates from loaded inventory data');
      }
      
      setInventory(uniqueInventory);
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

  // Manual sync function - triggers server-side sync and WebSocket events
  const handleManualSync = useCallback(async () => {
    try {
      console.log('🔄 Manual sync triggered by user');
      
      // Call the new manual sync endpoint which triggers server-side sync
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/sync/manual', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to sync inventory');
      }

      const data = await response.json();
      console.log('📊 Manual sync completed:', data.inventory?.length || 0, 'items');
      
      // Remove duplicates from loaded data
      const uniqueInventory = data.inventory?.filter((item: any, index: number, self: any[]) => 
        index === self.findIndex((t: any) => t.id === item.id)
      ) || [];
      
      // Update inventory without loading state to prevent flashing
      setInventory(uniqueInventory);
      
      console.log('✅ Manual sync completed - server-side sync triggered');
      // Note: sync time will be updated via WebSocket events from server
    } catch (error) {
      console.error('❌ Manual sync failed:', error);
      setError('Failed to sync data manually');
    }
  }, [socket]);

  // Filter and sort inventory based on search term, selected items filter, and sort config
  useEffect(() => {
    let filtered = inventory;
    
    // Apply selected items filter first
    if (showOnlySelected && selectedItems.size > 0) {
      console.log('🔍 Showing only selected items:', selectedItems.size, 'selected');
      console.log('📋 Selected item IDs:', Array.from(selectedItems));
      console.log('📊 Total inventory items:', inventory.length);
      
      filtered = inventory.filter(item => {
        const isSelected = selectedItems.has(item.id);
        if (isSelected) {
          console.log('✅ Found selected item:', {
            id: item.id,
            product_name: item.product_name,
            warehouse: item.warehouse,
            source: item.source
          });
        }
        return isSelected;
      });
      
      console.log('📊 Filtered to selected items:', filtered.length);
    }
    
    // Apply search filter
    if (searchTerm.trim()) {
      filtered = filtered.filter(item => {
        const searchLower = searchTerm.toLowerCase();
        return (
          item.product_name?.toLowerCase().includes(searchLower) ||
          item.brand?.toLowerCase().includes(searchLower) ||
          item.product_code?.toLowerCase().includes(searchLower) ||
          item.lot_number?.toLowerCase().includes(searchLower) ||
          item.location?.toLowerCase().includes(searchLower) ||
          item.warehouse?.toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Apply sorting
    const sorted = getSortedInventory(filtered);
    console.log('🔍 Filtering debug - inventory length:', inventory.length);
    console.log('🔍 Filtering debug - filtered length:', filtered.length);
    console.log('🔍 Filtering debug - sorted length:', sorted.length);
    console.log('🔍 Filtering debug - search term:', searchTerm);
    console.log('🔍 Filtering debug - show only selected:', showOnlySelected);
    console.log('🔍 Filtering debug - selected items count:', selectedItems.size);
    setFilteredInventory(sorted);
  }, [inventory, searchTerm, sortConfig, showOnlySelected, selectedItems]);

  // Handle real-time inventory updates
  useEffect(() => {
    // Allow updates during bulk delete but prevent checkbox flickering by preserving selection
    if (inventoryUpdates.length > 0) {
      const latestUpdate = inventoryUpdates[0]; // Always use the first (latest) update
      
      // Create a unique identifier for this update to prevent duplicate processing
      const updateId = `${latestUpdate.action}_${latestUpdate.data?.id || 'unknown'}_${Date.now()}`;
      
      // Skip if we've already processed this update
      if (lastProcessedUpdateRef.current === updateId) {
        console.log('⏭️ Skipping duplicate update:', updateId);
        return;
      }
      
      lastProcessedUpdateRef.current = updateId;
      console.log('🔄 Processing inventory update:', latestUpdate);
      console.log('📦 Full update data:', JSON.stringify(latestUpdate, null, 2));
      
      switch (latestUpdate.action) {
        case 'ADD':
          // Add new item to the list (check for duplicates first)
          const newItem = {
            ...latestUpdate.data.item,
            id: latestUpdate.data.id
          };
          console.log('➕ Adding new item:', newItem);
          setInventory(prev => {
            // Check if item already exists to prevent duplicates
            const existingItem = prev.find(item => item.id === latestUpdate.data.id);
            if (existingItem) {
              console.log('⚠️ Item already exists, skipping duplicate:', latestUpdate.data.id);
              return prev;
            }
            console.log('✅ Adding new item to inventory');
            return [...prev, newItem];
          });
          break;
          
        case 'DELETE':
          // Remove item from the list
          console.log('🗑️ Removing item from inventory:', latestUpdate.data.id);
          setInventory(prev => {
            console.log('📋 Current inventory items:', prev.map((item: any) => ({ id: item.id, product_name: item.product_name })));
            
            // Try to find the item by exact ID first
            let filtered = prev.filter(item => item.id !== latestUpdate.data.id);
            
            // If no item was found by exact ID, try to find by similar ID patterns
            if (prev.length === filtered.length) {
              console.log('🔍 Item not found by exact ID, trying pattern matching...');
              
              // Try to find items that might be the same but with different ID format
              const deletedData = latestUpdate.data.deletedData;
              if (deletedData && Array.isArray(deletedData)) {
                // For test data, try to match by the test pattern
                if (deletedData[0] === 'test') {
                  const testNumber = deletedData[1];
                  console.log('🔍 Looking for test item with number:', testNumber);
                  
                  filtered = prev.filter(item => {
                    // Skip items that don't match the test pattern
                    if (!item.product_name || !item.product_name.includes('test')) {
                      return true;
                    }
                    
                    // Try to extract test number from product name or other fields
                    const itemTestMatch = item.product_name.match(/test.*?(\d+)/i);
                    if (itemTestMatch && itemTestMatch[1] === testNumber) {
                      console.log('❌ Removing test item:', item.id, 'with test number:', testNumber);
                      return false;
                    }
                    
                    return true;
                  });
                }
              }
            }
            
            console.log('📊 Inventory after delete - before:', prev.length, 'after:', filtered.length);
            console.log('🔍 Looking for item with ID:', latestUpdate.data.id);
            console.log('📋 Available IDs:', prev.map(item => item.id));
            
            // If still no items found to delete, reload the inventory to ensure consistency
            if (prev.length === filtered.length) {
              console.log('⚠️ Item not found in current inventory, reloading data...');
              setTimeout(() => {
                loadInventory();
              }, 1000);
            }
            
            return filtered;
          });
          
          // Remove deleted item from selection if it was selected
          setSelectedItems(prev => {
            const newSelection = new Set(prev);
            newSelection.delete(latestUpdate.data.id);
            return newSelection;
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
            console.log('📊 Refresh data - inventory length:', latestUpdate.data.inventory.length);
            
            setInventory(prev => {
              // Check if this refresh includes DELETE changes (from bulk delete)
              const hasDeleteChanges = latestUpdate.data.changes && 
                latestUpdate.data.changes.some((c: any) => c.action === 'DELETE');
              
              // Always accept refresh if it has DELETE changes, or if it has more/equal items
              if (latestUpdate.data.inventory.length >= prev.length || hasDeleteChanges) {
                console.log('✅ Accepting refresh update - has', hasDeleteChanges ? 'DELETE changes' : 'more/equal items');
                
                // Remove any duplicates that might exist
                const uniqueItems = latestUpdate.data.inventory.filter((item: any, index: number, self: any[]) => 
                  index === self.findIndex((t: any) => t.id === item.id)
                );
                
                if (uniqueItems.length !== latestUpdate.data.inventory.length) {
                  console.log('🧹 Removed duplicates from refresh data');
                }
                
                return uniqueItems;
              } else {
                console.log('⚠️ Ignoring refresh update - fewer items and no DELETE changes');
                return prev;
              }
            });
            
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
          
        case 'BULK_SEND_OUT':
          console.log('📤 Received bulk send out event');
          setInventory(prev => {
            const updatedInventory = [...prev];
            if (latestUpdate.data.changes) {
              latestUpdate.data.changes.forEach((change: any) => {
                const itemIndex = updatedInventory.findIndex(item => item.id === change.rowId);
                if (itemIndex !== -1 && change.newValue && typeof change.newValue.quantity !== 'undefined') {
                  updatedInventory[itemIndex] = {
                    ...updatedInventory[itemIndex],
                    quantity: change.newValue.quantity.toString()
                  };
                }
              });
            }
            return updatedInventory;
          });
          break;
          
        case 'RELOCATE':
          console.log('🔄 Received relocation event');
          // Refresh the entire inventory to get the updated data from both sources
          loadInventory();
          break;
      }
      
      // Clear the processed updates to prevent accumulation
      // This will be handled by the WebSocket context now
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
        body: JSON.stringify({
          ...newItem,
          targetSource: 'source1' // Default to source1
        }),
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



  // Remove force refresh to prevent screen flashing
  // The WebSocket will handle UI updates automatically

  // Handle item deletion
  const handleDeleteItem = async (id: string) => {
    // Prevent multiple deletions at the same time
    if (isDeletionInProgress) {
      console.log('⚠️ Deletion already in progress, ignoring request');
      return;
    }
    

    
    try {
      setIsDeletionInProgress(true);
      setDeletingItem(id);
      
      // Find the item to get its source information and data
      const item = inventory.find(item => item.id === id);
      if (!item) {
        throw new Error('Item not found in current inventory');
      }
      
      const source = item.source || 'source1';
      
      // Add a 2-second delay to prevent rapid deletions and race conditions
      console.log('⏳ Adding 2-second delay before delete to prevent race conditions...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/stock/inventory/${id}?source=${source}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          itemData: {
            id: item.id, // Include the original ID for row matching
            product_code: item.product_code,
            product_name: item.product_name,
            brand: item.brand,
            lot_number: item.lot_number,
            quantity: item.quantity,
            unit: item.unit,
            expiry_date: item.expiry_date,
            location: item.location,
            warehouse: item.warehouse,
            notes: item.notes
          }
        }),
      });

      // Handle 429 sync delay BEFORE processing as an error
      if (!response.ok && response.status === 429) {
        const errorData = await response.json().catch(() => ({}));
        console.log('🔍 Debug - Got 429 status, checking for sync delay...');
        console.log('🔍 Debug - Error message:', errorData.message);
        
        // Check if this is a sync delay that we should retry automatically
        if (errorData.message && (
          errorData.message.includes('Google Sheets sync') || 
          errorData.message.includes('Google Sheets to sync')
        )) {
          console.log('✅ Detected sync delay - will retry automatically (no error shown to user)');
          const waitTime = errorData.remainingTime || 2000;
          console.log(`⏳ Waiting ${waitTime}ms + 500ms buffer before retry...`);
          
          // Wait for the required time plus buffer
          await new Promise(resolve => setTimeout(resolve, waitTime + 500));
          
          console.log('🔄 Retrying delete after sync delay...');
          
          // Retry the exact same request
          const retryResponse = await fetch(`http://localhost:3001/api/stock/inventory/${id}?source=${source}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              itemData: {
                id: item.id,
                product_code: item.product_code,
                product_name: item.product_name,
                brand: item.brand,
                lot_number: item.lot_number,
                quantity: item.quantity,
                unit: item.unit,
                expiry_date: item.expiry_date,
                location: item.location,
                warehouse: item.warehouse,
                notes: item.notes
              }
            }),
          });
          
          if (!retryResponse.ok) {
            const retryErrorData = await retryResponse.json().catch(() => ({}));
            console.error('❌ Retry failed after sync delay:', retryErrorData);
            throw new Error(retryErrorData.message || 'Failed to delete item after waiting for sync');
          }
          
          console.log('✅ Delete successful after sync retry');
          return; // Success - exit function here
        }
      }

      // Handle all other types of errors (non-429 or non-sync-related 429s)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ Delete failed:', errorData);
        console.log('🔍 Debug - Response status:', response.status);
        console.log('🔍 Debug - Error message:', errorData.message);
        
        if (errorData.message === 'Item not found' || errorData.message === 'Item not found - please try again' || errorData.message === 'Item not found - please refresh and try again') {
          // If item not found, it might be due to outdated row indices
          // Refresh the inventory data to get updated row indices
          console.log('🔄 Item not found, refreshing inventory data...');
          await loadInventory();
          
          // Add additional context based on error type
          if (errorData.error === 'ROW_INDEX_OUT_OF_BOUNDS') {
            console.log('📊 Row index out of bounds - current row count:', errorData.currentRowCount);
            throw new Error(`Row index issue detected. Current sheet has ${errorData.currentRowCount} rows. Please try deleting again.`);
          } else if (errorData.error === 'NO_DATA_AVAILABLE') {
            throw new Error('No data available in the sheet. Please refresh and try again.');
          } else if (errorData.error === 'RETRY_ERROR') {
            throw new Error(`Retry failed: ${errorData.details || 'Unknown error'}. Please refresh and try again.`);
          } else {
            throw new Error('Item not found - please try deleting again');
          }
        }
        
        throw new Error(errorData.message || 'Failed to delete item');
      }

      console.log('🗑️ Delete request sent for item:', id);
      // Note: The WebSocket will handle updating the UI automatically
    } catch (err) {
      console.error('❌ Error deleting item:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete item');
      
      // If delete failed, reload inventory to restore the item
      console.log('🔄 Reloading inventory due to delete failure...');
      setTimeout(() => {
        loadInventory();
      }, 1000);
    } finally {
      setDeletingItem(null);
      setIsDeletionInProgress(false);
    }
  };

  // Handle starting edit mode for a specific field
  const handleStartEdit = (item: InventoryItem, field: keyof InventoryItem) => {
    if (isSavingEdit) return; // Prevent starting a new edit while saving
    // If we're already editing a different field, save it first
    if (editingItem && editingField && (editingItem.id !== item.id || editingField !== field)) {
      setIsSavingEdit(true);
      handleSaveEdit().then(() => {
        setIsSavingEdit(false);
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
      }).catch(() => {
        setIsSavingEdit(false);
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
    setIsSavingEdit(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/stock/inventory/${editingItem.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...editingData,
          source: editingItem.source,
          sourceId: editingItem.sourceId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to update item');
      }

      // Clear edit state
      setEditingItem(null);
      setEditingField(null);
      setEditingData({});
      setIsSavingEdit(false);
      // Note: The WebSocket will handle updating the UI automatically
      return Promise.resolve();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
      setIsSavingEdit(false);
      return Promise.reject(err);
    }
  }, [editingItem, editingData]);



  // Enhance click outside handler to always save if editing
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
      
      // Save when clicking outside any editable cell (including outside the table)
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

  // Save edit on route (tab) change
  useEffect(() => {
    if (editingItem) {
      handleSaveEdit();
    }
    // eslint-disable-next-line
  }, [location.pathname]);

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
      return null; // No icon if not sorted
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  // Add a helper function to format date strings as DD/MM/YYYY
  const formatDateDisplay = (dateStr: string | undefined) => {
    if (!dateStr || dateStr === 'undefined' || dateStr.includes('undefined')) return '';
    
    // Clean the date string
    const cleanDate = dateStr.replace(/undefined/g, '').trim();
    if (!cleanDate) return '';
    
    // Check if it's already in DD-MM-YYYY format
    if (cleanDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
      return cleanDate;
    }
    
    // Convert YYYY-MM-DD to DD-MM-YYYY
    if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parts = cleanDate.split('-');
      const [year, month, day] = parts;
      return `${day}-${month}-${year}`;
    }
    
    // Convert DD/MM/YYYY to DD-MM-YYYY
    if (cleanDate.includes('/')) {
      const parts = cleanDate.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        return `${day}-${month}-${year}`;
      }
    }
    
    // For any other format, just return the cleaned string
    return cleanDate;
  };

  // Convert date to YYYY-MM-DD format for HTML date inputs
  const formatDateForInput = (dateStr: string | undefined) => {
    if (!dateStr || dateStr === 'undefined' || dateStr.includes('undefined')) return '';
    
    // Clean the date string
    const cleanDate = dateStr.replace(/undefined/g, '').trim();
    if (!cleanDate) return '';
    
    // If it's already in YYYY-MM-DD format, return as is
    if (cleanDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return cleanDate;
    }
    
    // Convert DD-MM-YYYY to YYYY-MM-DD
    if (cleanDate.includes('-')) {
      const parts = cleanDate.split('-');
      if (parts.length === 3 && parts[0].length <= 2) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    
    // Convert DD/MM/YYYY to YYYY-MM-DD
    if (cleanDate.includes('/')) {
      const parts = cleanDate.split('/');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    
    return cleanDate; // fallback
  };

  // Add bulk selection handlers
const handleSelectItem = (itemId: string) => {
  const newSelected = new Set(selectedItems);
  if (newSelected.has(itemId)) {
    newSelected.delete(itemId);
    console.log('➖ Deselected item:', itemId);
  } else {
    newSelected.add(itemId);
    console.log('➕ Selected item:', itemId);
  }
  console.log('📋 Current selected items:', Array.from(newSelected));
  setSelectedItems(newSelected);
  
  // Automatically enable bulk mode when items are selected
  if (newSelected.size === 0) {
    setIsBulkActionMode(false);
    setShowOnlySelected(false);
  } else {
    setIsBulkActionMode(true);
  }
};

const handleSelectAll = () => {
  if (selectedItems.size === filteredInventory.length) {
    setSelectedItems(new Set());
    setIsBulkActionMode(false);
    setShowOnlySelected(false);
  } else {
    setSelectedItems(new Set(filteredInventory.map(item => item.id)));
    setIsBulkActionMode(true); // Automatically enable bulk mode
  }
};

const handleBulkCheckout = () => {
  if (selectedItems.size === 0) {
    alert('Please select items to checkout');
    return;
  }

  // Navigate to checkout page with selected items
  navigate('/checkout', { 
    state: { selectedItems: Array.from(selectedItems) }
  });
};

const handleClearSelection = () => {
  console.log('🧹 Manually clearing selection');
  setSelectedItems(new Set());
  setIsBulkActionMode(false);
  setShowOnlySelected(false);
  localStorage.removeItem('inventorySelectedItems');
  console.log('✅ Selection cleared');
};

  const handleShowSelectedItems = () => {
    if (selectedItems.size > 0) {
      console.log('🔍 Toggling show only selected items');
      console.log('📋 Selected items count:', selectedItems.size);
      console.log('📋 Selected item IDs:', Array.from(selectedItems));
      setShowOnlySelected(!showOnlySelected);
    }
  };

  // Column visibility functions
  const toggleColumnVisibility = (column: keyof typeof columnVisibility) => {
    setColumnVisibility((prev: typeof columnVisibility) => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  const resetColumnVisibility = () => {
    setColumnVisibility({
      checkbox: true,
      brand: true,
      product_code: true,
      product_name: true,
      quantity: true,
      unit: true,
      location: true,
      warehouse: true,
      lot_number: true,
      expiry_date: true,
      import_date: true,
      notes: true,
      actions: true
    });
  };

  // Save column visibility to localStorage
  useEffect(() => {
    localStorage.setItem('inventoryColumnVisibility', JSON.stringify(columnVisibility));
  }, [columnVisibility]);





  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      setError('Please select items to delete');
      return;
    }

    try {
      setIsDeletionInProgress(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const itemIds = Array.from(selectedItems);
      
      console.log('🗑️ Starting efficient bulk delete for', itemIds.length, 'items');
      
      // Prepare items data for bulk delete
      const itemsToDelete = itemIds.map(itemId => {
        const item = inventory.find(item => item.id === itemId);
        return {
          id: itemId,
          source: item?.source || 'source1'
        };
      });
      
      // Call the new bulk delete endpoint
      const response = await fetch('http://localhost:3001/api/stock/inventory/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          items: itemsToDelete
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to delete items');
      }

      const result = await response.json();
      console.log('✅ Bulk delete completed:', result);
      
      // Check for any failures
      const failed = result.results?.filter((r: any) => !r.success) || [];
      if (failed.length > 0) {
        console.log('❌ Some deletions failed:', failed);
        setError(`Successfully deleted ${result.deletedCount} items. ${failed.length} items failed to delete.`);
      } else {
        console.log('✅ All items deleted successfully');
      }
      
      // Clear selection and localStorage
      setSelectedItems(new Set());
      setIsBulkActionMode(false);
      localStorage.removeItem('inventorySelectedItems');
      
    } catch (err) {
      console.error('❌ Bulk delete error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete items');
    } finally {
      setIsDeletionInProgress(false);
    }
  };

const handleBulkSendOut = async () => {
  if (selectedItems.size === 0) {
    alert('Please select items to send out');
    return;
  }

  try {
    setLoading(true);
    const token = localStorage.getItem('token');
    const itemIds = Array.from(selectedItems);
    const quantities: { [key: string]: number } = {};
    
    // Set quantity to 1 for each selected item
    itemIds.forEach(id => {
      quantities[id] = 1;
    });

    const response = await fetch('/api/stock/bulk-send-out', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ itemIds, quantities })
    });

    const result = await response.json();

    if (response.ok) {
      alert(`✅ Successfully sent out ${itemIds.length} items!`);
      // Refresh inventory data
      loadInventory();
      // Clear selection
      setSelectedItems(new Set());
      setIsBulkActionMode(false);
      // Clear localStorage
      localStorage.removeItem('inventorySelectedItems');
    } else {
      alert(`❌ Error: ${result.message}`);
    }
  } catch (error) {
    console.error('Error during bulk send out:', error);
    alert('❌ An error occurred while sending items out. Please try again.');
  } finally {
    setLoading(false);
  }
};

  // Handle relocation of selected items
  const handleRelocateItems = async (destinationLocation: string, notes: string = '') => {
    if (selectedItems.size === 0) {
      alert('Please select items to relocate');
      return;
    }

    // Determine source location based on selected items
    const selectedItemsList = Array.from(selectedItems);
    const firstItem = inventory.find(item => item.id === selectedItemsList[0]);
    
    console.log('🔍 Relocation Debug:');
    console.log('Selected items:', selectedItemsList);
    console.log('First item:', firstItem);
    console.log('First item warehouse:', firstItem?.warehouse);
    
    if (!firstItem) {
      alert('Selected items not found');
      return;
    }

    const sourceLocation = firstItem.warehouse;
    console.log('Source location determined:', sourceLocation);
    console.log('Destination location:', destinationLocation);
    
    if (!sourceLocation) {
      alert('Unable to determine source location. Please refresh the page and try again.');
      return;
    }
    
    // Validate all selected items are from the same location
    const allFromSameLocation = selectedItemsList.every(itemId => {
      const item = inventory.find(i => i.id === itemId);
      return item && item.warehouse === sourceLocation;
    });

    if (!allFromSameLocation) {
      alert('All selected items must be from the same location');
      return;
    }

    if (sourceLocation === destinationLocation) {
      alert('Items are already in the selected location');
      return;
    }

    try {
      setIsRelocating(true);
      setShowRelocationTab(false); // Close tab immediately
      const token = localStorage.getItem('token');
      
      const requestData = {
        itemIds: selectedItemsList,
        sourceLocation,
        destinationLocation,
        notes
      };
      
      console.log('🚀 Sending relocation request:', requestData);
      
      const response = await fetch('/api/stock/inventory/relocate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestData)
      });

      const result = await response.json();
      console.log('📨 Relocation response:', result);

      if (response.ok) {
        // Clear selection and refresh inventory
        setSelectedItems(new Set());
        setIsBulkActionMode(false);
        setShowOnlySelected(false);
        localStorage.removeItem('inventorySelectedItems');
        
        // Refresh inventory data
        await loadInventory();
      } else {
        console.error('❌ Relocation failed:', result);
        alert(`❌ Error: ${result.message}`);
      }
    } catch (error) {
      console.error('❌ Error relocating items:', error);
      alert('❌ An error occurred during relocation. Please try again.');
    } finally {
      setIsRelocating(false);
    }
  };

  // Get locations for relocation
  const getAvailableLocations = () => {
    const locations = ['TH', 'VKT'];
    const selectedItemsList = Array.from(selectedItems);
    
    if (selectedItemsList.length === 0) return locations;
    
    const firstItem = inventory.find(item => item.id === selectedItemsList[0]);
    const currentLocation = firstItem?.warehouse;
    
    return locations.filter(loc => loc !== currentLocation);
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
                       field === 'expiry_date' || field === 'import_date' ? 'date' : 'text';
      
      // Use formatDateForInput for date fields
      const inputValue = (field === 'expiry_date' || field === 'import_date') 
        ? formatDateForInput(editingData[field])
        : (editingData[field] || '');
      
      return (
        <input
          type={inputType}
          value={inputValue}
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
          disabled={isSavingEdit}
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
          disabled={isSavingEdit}
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
            disabled={isSavingEdit}
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
            disabled={isSavingEdit}
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
        {`${item.quantity ?? ''} ${item.unit ?? ''}`}
      </div>
    );
  };

  // Render inline add row
  const renderAddRow = () => {
    if (!isAddingItem) {
      return (
        <tr className="bg-blue-50 hover:bg-blue-100 transition-colors duration-150">
          <td colSpan={13} className="px-6 py-4">
            <button
              onClick={async () => {
                if (editingItem) await handleSaveEdit();
                handleStartAdd();
              }}
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
        {columnVisibility.checkbox && (
          <td className="px-6 py-4">
            {/* Checkbox column - disabled for new item */}
            <div className="flex items-center">
              <input
                type="checkbox"
                disabled
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-not-allowed"
              />
            </div>
          </td>
        )}
        {columnVisibility.brand && (
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
        )}

        {columnVisibility.product_code && (
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
        )}
        {columnVisibility.product_name && (
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
        )}
        {columnVisibility.quantity && (
          <td className="px-6 py-4">
            <input
              type="number"
              placeholder="Qty"
              value={newItem.quantity ?? ''}
              onChange={(e) => setNewItem({...newItem, quantity: e.target.value})}
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
        )}
        {columnVisibility.unit && (
          <td className="px-6 py-4">
            <input
              type="text"
              placeholder="Unit"
              value={newItem.unit || ''}
              onChange={(e) => setNewItem({...newItem, unit: e.target.value})}
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
        )}
        {columnVisibility.location && (
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
        )}
        {columnVisibility.warehouse && (
          <td className="px-6 py-4">
            <input
              type="text"
              placeholder="Places"
              value={newItem.warehouse || ''}
              onChange={(e) => setNewItem({...newItem, warehouse: e.target.value})}
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
        )}
        {columnVisibility.lot_number && (
          <td className="px-6 py-4">
            <input
              type="text"
              placeholder="Lot Number"
              value={newItem.lot_number || ''}
              onChange={(e) => setNewItem({...newItem, lot_number: e.target.value})}
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
        )}
        {columnVisibility.expiry_date && (
          <td className="px-6 py-4">
            {isAddingItem ? (
              <input
                type="date"
                placeholder="dd-mm-yyyy"
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
            ) : (
              formatDateDisplay(newItem.expiry_date)
            )}
          </td>
        )}
        {columnVisibility.import_date && (
          <td className="px-6 py-4">
            {isAddingItem ? (
              <input
                type="date"
                placeholder="dd-mm-yyyy"
                value={newItem.import_date || ''}
                onChange={(e) => setNewItem({...newItem, import_date: e.target.value})}
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
            ) : (
              formatDateDisplay(newItem.import_date)
            )}
          </td>
        )}
        {columnVisibility.notes && (
          <td className="px-6 py-4">
            <input
              type="text"
              placeholder="Notes"
              value={newItem.notes || ''}
              onChange={(e) => setNewItem({...newItem, notes: e.target.value})}
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
        )}
        {columnVisibility.actions && (
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
        )}
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

        {/* Connection Status and Action Buttons */}
                  <div className="mt-4 sm:mt-0 flex items-center space-x-4">
            <div className="flex flex-col space-y-1 text-sm relative">
              {/* Row 1: Last sync timestamp */}
              <div className="text-xs text-gray-500 flex items-center">
                Last sync: {lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Unknown'}
                <span 
                  className="inline-block w-5 ml-1 cursor-pointer hover:bg-gray-100 rounded p-1 transition-colors"
                  onClick={handleManualSync}
                  title={syncStatus === 'syncing' ? 'Syncing...' : 'Click to sync now'}
                >
                  {syncStatus === 'syncing' ? (
                    <span className="text-blue-600 animate-spin">🔄</span>
                  ) : syncStatus === 'error' ? (
                    <span className="text-red-600 hover:text-red-800">❌</span>
                  ) : (
                    <span className="text-blue-600 hover:text-blue-800">🔄</span>
                  )}
                </span>
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

      {/* Compact Toolbar */}
      <div className="bg-white rounded-lg shadow">
        {/* Main Toolbar Row */}
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center space-x-3 flex-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={async (e) => {
                  if (editingItem) await handleSaveEdit();
                  setSearchTerm(e.target.value);
                }}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 pr-2 flex items-center text-gray-400 hover:text-gray-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            
            {/* Results Count */}
            <span className="text-sm text-gray-500 whitespace-nowrap">
              {filteredInventory.length} of {inventory.length} items
            </span>
          </div>

          <div className="flex items-center space-x-2">

            

            
            {/* Column Toggle */}
            <button
              onClick={() => setShowColumnVisibility(!showColumnVisibility)}
              className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
              title="Toggle column visibility"
            >
              ⊞ Columns ({Object.values(columnVisibility).filter(Boolean).length})
            </button>
            

          </div>
        </div>

        {/* Bulk Actions Bar - Separate Prominent Section */}
        {isBulkActionMode && selectedItems.size > 0 && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <button
                    onClick={handleShowSelectedItems}
                    className={`text-lg font-semibold transition-colors cursor-pointer hover:underline ${
                      showOnlySelected 
                        ? 'text-blue-900' 
                        : 'text-blue-800 hover:text-blue-900'
                    }`}
                    title={showOnlySelected ? "Click to show all items" : "Click to show only selected items"}
                  >
                    {selectedItems.size} item(s) selected {showOnlySelected && '(filtered)'}
                  </button>
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowRelocationTab(!showRelocationTab)}
                  disabled={isRelocating}
                  className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-colors ${
                    showRelocationTab 
                      ? 'bg-green-700 hover:bg-green-800' 
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{isRelocating ? 'Relocating...' : showRelocationTab ? 'Hide Relocate' : 'Relocate'}</span>
                </button>
                
                <button
                  onClick={() => {
                    handleBulkSendOut();
                  }}
                  disabled={isBulkDeleteInProgress}
                  className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isBulkDeleteInProgress ? 'Processing...' : 'Send Out'}
                </button>
                
                <button
                  onClick={() => {
                    handleBulkCheckout();
                  }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Checkout
                </button>
                
                <button
                  onClick={() => {
                    handleBulkDelete();
                  }}
                  disabled={isBulkDeleteInProgress}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isBulkDeleteInProgress ? 'Deleting...' : 'Delete'}
                </button>
                
                <button
                  onClick={() => {
                    setSelectedItems(new Set());
                    setIsBulkActionMode(false);
                    setShowOnlySelected(false);
                    localStorage.removeItem('inventorySelectedItems');
                  }}
                  className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Expandable Relocation Tab */}
        {showRelocationTab && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-green-800 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Relocate Items
              </h3>
              <button
                onClick={() => setShowRelocationTab(false)}
                className="text-green-600 hover:text-green-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-green-700 mb-3">
                    Moving <span className="font-medium">{selectedItems.size}</span> item(s) from{' '}
                    <span className="font-medium">
                      {(() => {
                        const selectedItemsList = Array.from(selectedItems);
                        const firstItem = inventory.find(item => item.id === selectedItemsList[0]);
                        return firstItem?.warehouse || 'Unknown';
                      })()}
                    </span>
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-green-700 mb-2">
                    Destination Location *
                  </label>
                  <select
                    id="destinationLocation"
                    className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                    defaultValue={getAvailableLocations()[0] || ""}
                  >
                    {getAvailableLocations().map(location => (
                      <option key={location} value={location}>
                        {location === 'TH' ? 'TH - Tân Hải' : 'VKT - Vĩnh Kiến Thịnh'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-green-700 mb-2">
                  Relocation Notes (Optional)
                </label>
                <textarea
                  id="relocationNotes"
                  rows={4}
                  className="w-full px-3 py-2 border border-green-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 bg-white resize-none"
                  placeholder="Add detailed notes about this relocation...&#10;&#10;Example:&#10;• Reason for relocation&#10;• Special handling instructions&#10;• Quality notes"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-4">
              <button
                onClick={() => setShowRelocationTab(false)}
                disabled={isRelocating}
                className="px-4 py-2 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const destinationSelect = document.getElementById('destinationLocation') as HTMLSelectElement;
                  const notesTextarea = document.getElementById('relocationNotes') as HTMLTextAreaElement;
                  
                  if (!destinationSelect.value) {
                    alert('Please select a destination location');
                    return;
                  }
                  
                  handleRelocateItems(destinationSelect.value, notesTextarea.value);
                }}
                disabled={isRelocating}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2 transition-colors"
              >
                {isRelocating ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Relocating...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Relocate Items</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Column Visibility Panel */}
        {showColumnVisibility && (
          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600 font-medium">Show/hide columns:</span>
              <button
                onClick={resetColumnVisibility}
                className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
              >
                Reset
              </button>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-1">
              {Object.entries({
                checkbox: 'Checkbox',
                brand: 'Brand',
                product_code: 'Product Code',
                product_name: 'Product Name',
                quantity: 'Quantity',
                unit: 'Unit',
                location: 'Location',
                warehouse: 'Places',
                lot_number: 'Lot Number',
                expiry_date: 'Expiry Date',
                import_date: 'Entry Date',
                notes: 'Notes',
                actions: 'Actions'
              }).map(([key, label]) => (
                <label key={key} className="flex items-center space-x-1 text-xs">
                  <input
                    type="checkbox"
                    checked={columnVisibility[key as keyof typeof columnVisibility]}
                    onChange={() => toggleColumnVisibility(key as keyof typeof columnVisibility)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3 h-3"
                  />
                  <span className="text-gray-700 text-xs">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Inventory Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md mt-4">
        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {columnVisibility.checkbox && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === filteredInventory.length && filteredInventory.length > 0}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                )}
                {columnVisibility.brand && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('brand')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Brand</span>
                      {getSortIcon('brand') && (
                        <span className="text-xs">{getSortIcon('brand')}</span>
                      )}
                    </div>
                  </th>
                )}

                {columnVisibility.product_code && (
                  <th 
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/5 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('product_code')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Product Code</span>
                      {getSortIcon('product_code') && (
                        <span className="text-xs">{getSortIcon('product_code')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.product_name && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[300px] w-1/3 cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('product_name')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Product Name</span>
                      {getSortIcon('product_name') && (
                        <span className="text-xs">{getSortIcon('product_name')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.quantity && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('quantity')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Quantity</span>
                      {getSortIcon('quantity') && (
                        <span className="text-xs">{getSortIcon('quantity')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.unit && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('unit')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Unit</span>
                      {getSortIcon('unit') && (
                        <span className="text-xs">{getSortIcon('unit')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.location && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('location')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Location</span>
                      {getSortIcon('location') && (
                        <span className="text-xs">{getSortIcon('location')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.warehouse && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('warehouse')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Places</span>
                      {getSortIcon('warehouse') && (
                        <span className="text-xs">{getSortIcon('warehouse')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.lot_number && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('lot_number')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Lot Number</span>
                      {getSortIcon('lot_number') && (
                        <span className="text-xs">{getSortIcon('lot_number')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.expiry_date && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('expiry_date')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Expiry Date</span>
                      {getSortIcon('expiry_date') && (
                        <span className="text-xs">{getSortIcon('expiry_date')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.import_date && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('import_date')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Entry Date</span>
                      {getSortIcon('import_date') && (
                        <span className="text-xs">{getSortIcon('import_date')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.notes && (
                  <th 
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('notes')}
                  >
                    <div className="flex items-center space-x-1">
                      <span>Notes</span>
                      {getSortIcon('notes') && (
                        <span className="text-xs">{getSortIcon('notes')}</span>
                      )}
                    </div>
                  </th>
                )}
                {columnVisibility.actions && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Inline Add Row */}
              {renderAddRow()}
              
              {filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={Object.values(columnVisibility).filter(Boolean).length} className="px-6 py-8 text-center">
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
                    {columnVisibility.checkbox && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => handleSelectItem(item.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    {columnVisibility.brand && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" data-field="brand">
                        {editingItem?.id === item.id ? (
                          <input
                            type="text"
                            value={editingData.brand ?? ''}
                            onChange={e => setEditingData({ ...editingData, brand: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          renderEditableCell(item, 'brand', item.brand)
                        )}
                      </td>
                    )}

                    {columnVisibility.product_code && (
                      <td className="px-4 py-4 text-sm text-gray-500 w-1/5 break-words" data-field="product_code">
                        {editingItem?.id === item.id ? (
                          <input
                            type="text"
                            value={editingData.product_code ?? ''}
                            onChange={e => setEditingData({ ...editingData, product_code: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          <div className="break-words">
                            {renderEditableCell(item, 'product_code', item.product_code)}
                          </div>
                        )}
                      </td>
                    )}
                    {columnVisibility.product_name && (
                      <td className="px-6 py-4 text-sm text-gray-900 min-w-[300px] w-1/3" data-field="product_name">
                        {editingItem?.id === item.id ? (
                          <textarea
                            value={editingData.product_name ?? ''}
                            onChange={e => setEditingData({ ...editingData, product_name: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                            rows={2}
                            disabled={isSavingEdit}
                          />
                        ) : (
                          renderEditableTextarea(item, 'product_name', item.product_name)
                        )}
                      </td>
                    )}
                    {columnVisibility.quantity && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="quantity">
                        {editingItem?.id === item.id ? (
                          <input
                            type="number"
                            value={editingData.quantity ?? ''}
                            onChange={e => setEditingData({ ...editingData, quantity: e.target.value })}
                            className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          item.quantity ?? ''
                        )}
                      </td>
                    )}
                    {columnVisibility.unit && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="unit">
                        {editingItem?.id === item.id ? (
                          <input
                            type="text"
                            value={editingData.unit ?? ''}
                            onChange={e => setEditingData({ ...editingData, unit: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          renderEditableCell(item, 'unit', item.unit)
                        )}
                      </td>
                    )}
                    {columnVisibility.location && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="location">
                        {editingItem?.id === item.id ? (
                          <input
                            type="text"
                            value={editingData.location ?? ''}
                            onChange={e => setEditingData({ ...editingData, location: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          renderEditableCell(item, 'location', item.location)
                        )}
                      </td>
                    )}
                    {columnVisibility.warehouse && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="warehouse">
                        {editingItem?.id === item.id ? (
                          <input
                            type="text"
                            value={editingData.warehouse ?? ''}
                            onChange={e => setEditingData({ ...editingData, warehouse: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          <div className={`px-2 py-1 rounded text-center font-medium ${
                            item.warehouse === 'TH' ? 'bg-blue-100 text-blue-800' :
                            item.warehouse === 'VKT' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {item.warehouse}
                          </div>
                        )}
                      </td>
                    )}
                    {columnVisibility.lot_number && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="lot_number">
                        {editingItem?.id === item.id ? (
                          <input
                            type="text"
                            value={editingData.lot_number ?? ''}
                            onChange={e => setEditingData({ ...editingData, lot_number: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          renderEditableCell(item, 'lot_number', item.lot_number)
                        )}
                      </td>
                    )}
                    {columnVisibility.expiry_date && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="expiry_date">
                        {editingItem?.id === item.id ? (
                          <input
                            type="date"
                            value={formatDateForInput(editingData.expiry_date)}
                            onChange={e => setEditingData({ ...editingData, expiry_date: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          formatDateDisplay(item.expiry_date)
                        )}
                      </td>
                    )}
                    {columnVisibility.import_date && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="import_date">
                        {editingItem?.id === item.id ? (
                          <input
                            type="date"
                            value={formatDateForInput(editingData.import_date)}
                            onChange={e => setEditingData({ ...editingData, import_date: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          formatDateDisplay(item.import_date)
                        )}
                      </td>
                    )}
                    {columnVisibility.notes && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" data-field="notes">
                        {editingItem?.id === item.id ? (
                          <input
                            type="text"
                            value={editingData.notes ?? ''}
                            onChange={e => setEditingData({ ...editingData, notes: e.target.value })}
                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={isSavingEdit}
                          />
                        ) : (
                          renderEditableCell(item, 'notes', item.notes)
                        )}
                      </td>
                    )}
                    {columnVisibility.actions && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex space-x-2 justify-end">
                          {editingItem?.id === item.id ? (
                            <>
                              <button
                                onClick={handleSaveEdit}
                                className="text-green-600 hover:text-green-900"
                                disabled={isSavingEdit}
                                title="Save"
                              >
                                💾
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="text-gray-600 hover:text-gray-900"
                                disabled={isSavingEdit}
                                title="Cancel"
                              >
                                ✕
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setEditingField(null);
                                setEditingData({ ...item });
                              }}
                              className="text-blue-600 hover:text-blue-900"
                              title="Edit row"
                            >
                              ✏️
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            disabled={deletingItem === item.id || isDeletionInProgress}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                            title="Delete item"
                          >
                            {deletingItem === item.id ? (
                              <svg className="animate-spin h-5 w-5 text-red-600" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                            ) : (
                              '🗑️'
                            )}
                          </button>
                        </div>
                      </td>
                    )}
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
                    placeholder="dd-mm-yyyy"
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

      {/* Relocation Modal */}

    </div>
  );
};

export default Inventory; 