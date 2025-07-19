import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface CheckoutItem {
  id: string;
  product_name: string;
  brand: string;
  product_code: string;
  available_quantity: number;
  selected_quantity: number;
  unit: string;
  price?: number;
}

interface CheckoutForm {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  isNewCustomer: boolean;
  notes: string;
  items: CheckoutItem[];
}

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedItems = location.state?.selectedItems || [];
  
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [checkoutItems, setCheckoutItems] = useState<CheckoutItem[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [inventory, setInventory] = useState<any[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [form, setForm] = useState<CheckoutForm>({
    customerId: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerAddress: '',
    isNewCustomer: false,
    notes: '',
    items: []
  });

  // Save checkout data to localStorage whenever it changes
  useEffect(() => {
    // Only save/clear if component has been initialized
    if (isInitialized) {
      if (checkoutItems.length > 0) {
        localStorage.setItem('checkoutItems', JSON.stringify(checkoutItems));
        console.log('Saved checkout items to localStorage:', checkoutItems.length, 'items');
      } else if (checkoutItems.length === 0 && localStorage.getItem('checkoutItems')) {
        // Only clear if there was previously data in localStorage
        localStorage.removeItem('checkoutItems');
        console.log('Cleared checkout items from localStorage');
      }
    }
  }, [checkoutItems, isInitialized]);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('checkoutForm', JSON.stringify(form));
  }, [form]);

  // Load customers and prepare checkout items
  useEffect(() => {
    loadCustomers();
    
    // Load saved form data from localStorage
    const savedForm = localStorage.getItem('checkoutForm');
    if (savedForm) {
      try {
        const parsedForm = JSON.parse(savedForm);
        setForm(parsedForm);
      } catch (error) {
        console.error('Error loading saved form data:', error);
      }
    }
    
    // Prepare checkout items after a short delay to ensure proper initialization
    const timer = setTimeout(() => {
      prepareCheckoutItems();
      setIsInitialized(true);
    }, 100);
    
    // Cleanup function to clear localStorage when component unmounts
    return () => {
      clearTimeout(timer);
      // Only clear if user navigates away without completing checkout
      // (localStorage will be cleared on successful checkout)
    };
  }, []);

  const loadCustomers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/customers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCustomers(data.customers || []);
      }
    } catch (error) {
      console.error('Error loading customers:', error);
    }
  };

  const prepareCheckoutItems = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/stock/inventory', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        const inventoryData = data.inventory || [];
        setInventory(inventoryData);
        
        // Get selected items from navigation state or localStorage
        const selectedItems = location.state?.selectedItems || [];
        const savedCheckoutItems = localStorage.getItem('checkoutItems');
        
        console.log('Navigation state items:', selectedItems.length);
        console.log('Saved checkout items exists:', !!savedCheckoutItems);
        
        let itemsToProcess: string[] = [];
        
        // Priority: navigation state first, then localStorage
        if (selectedItems.length > 0) {
          // Use items from navigation state
          itemsToProcess = selectedItems;
          console.log('Using navigation state items:', itemsToProcess.length);
        } else if (savedCheckoutItems) {
          // Use saved checkout items
          try {
            const savedItems = JSON.parse(savedCheckoutItems);
            if (savedItems && savedItems.length > 0) {
              itemsToProcess = savedItems.map((item: CheckoutItem) => item.id);
              console.log('Using saved checkout items:', itemsToProcess.length);
            }
          } catch (error) {
            console.error('Error parsing saved checkout items:', error);
            localStorage.removeItem('checkoutItems');
          }
        }
        
        // Only redirect if we have no items from both sources
        if (itemsToProcess.length === 0) {
          console.log('No items to process, redirecting to inventory');
          // No items to checkout, redirect back to inventory
          navigate('/inventory');
          return;
        }
        
        // Create checkout items with inventory data
        const items: CheckoutItem[] = itemsToProcess.map((itemId: string) => {
          const inventoryItem = inventoryData.find((item: any) => item.id === itemId);
          
          // Check if we have saved data for this item
          let savedItem = null;
          if (savedCheckoutItems) {
            const savedItems = JSON.parse(savedCheckoutItems);
            savedItem = savedItems.find((item: CheckoutItem) => item.id === itemId);
          }
          
          // If inventory item not found, use saved data if available
          if (!inventoryItem && savedItem) {
            return {
              id: itemId,
              product_name: savedItem.product_name || 'Item not found',
              brand: savedItem.brand || '',
              product_code: savedItem.product_code || '',
              available_quantity: savedItem.available_quantity || 0,
              selected_quantity: savedItem.selected_quantity || 1,
              unit: savedItem.unit || '',
              price: savedItem.price || 0
            };
          }
          
          return {
            id: itemId,
            product_name: inventoryItem?.product_name || '',
            brand: inventoryItem?.brand || '',
            product_code: inventoryItem?.product_code || '',
            available_quantity: parseInt(inventoryItem?.quantity || '0'),
            selected_quantity: savedItem ? savedItem.selected_quantity : 1,
            unit: inventoryItem?.unit || '',
            price: parseFloat(inventoryItem?.price || '0')
          };
        });
        
        setCheckoutItems(items);
        setForm(prev => ({ ...prev, items }));
        setIsInitialized(true);
      }
    } catch (error) {
      console.error('Error preparing checkout items:', error);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    if (customerId === 'new') {
      setForm(prev => ({ ...prev, customerId: '', isNewCustomer: true }));
    } else {
      const customer = customers.find(c => c.id === customerId);
      if (customer) {
        setForm(prev => ({
          ...prev,
          customerId,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: customer.phone,
          customerAddress: customer.address,
          isNewCustomer: false
        }));
      }
    }
  };

  const handleQuantityChange = (itemId: string, quantity: number) => {
    setCheckoutItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, selected_quantity: quantity } : item
    ));
    setForm(prev => ({
      ...prev,
      items: prev.items.map(item => 
        item.id === itemId ? { ...item, selected_quantity: quantity } : item
      )
    }));
  };

  const handleRemoveItem = (itemId: string) => {
    setCheckoutItems(prev => prev.filter(item => item.id !== itemId));
    setForm(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  const handleAddItem = (item: any) => {
    // Check if item is already in checkout
    const existingItem = checkoutItems.find(checkoutItem => checkoutItem.id === item.id);
    if (existingItem) {
      // If item exists, increase quantity by 1
      setCheckoutItems(prev => prev.map(checkoutItem => 
        checkoutItem.id === item.id 
          ? { ...checkoutItem, selected_quantity: Math.min(checkoutItem.selected_quantity + 1, item.quantity) }
          : checkoutItem
      ));
    } else {
      // Add new item to checkout
      const newCheckoutItem: CheckoutItem = {
        id: item.id,
        product_name: item.product_name,
        brand: item.brand,
        product_code: item.product_code,
        available_quantity: parseInt(item.quantity),
        selected_quantity: 1,
        unit: item.unit || '',
        price: item.price || 0
      };
      setCheckoutItems(prev => [...prev, newCheckoutItem]);
    }
    setSearchTerm('');
    setShowSearchResults(false);
  };

  const filteredInventory = inventory.filter(item => {
    const searchLower = searchTerm.toLowerCase();
    return (
      item.product_name?.toLowerCase().includes(searchLower) ||
      item.brand?.toLowerCase().includes(searchLower) ||
      item.product_code?.toLowerCase().includes(searchLower)
    );
  }).filter(item => {
    // Only show items that are not already in checkout or have available quantity
    const existingItem = checkoutItems.find(checkoutItem => checkoutItem.id === item.id);
    return !existingItem || existingItem.selected_quantity < parseInt(item.quantity);
  });

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.search-container')) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!form.customerName.trim()) {
      alert('Please enter customer name');
      return;
    }
    
    if (!form.customerAddress.trim()) {
      alert('Please enter customer address');
      return;
    }
    
    const itemsWithQuantity = checkoutItems.filter(item => item.selected_quantity > 0);
    if (itemsWithQuantity.length === 0) {
      alert('Please select quantities for at least one item');
      return;
    }
    
    // Check if quantities are valid
    for (const item of itemsWithQuantity) {
      if (item.selected_quantity > item.available_quantity) {
        alert(`Insufficient quantity for ${item.product_name}. Available: ${item.available_quantity}, Selected: ${item.selected_quantity}`);
        return;
      }
    }

    const confirmed = window.confirm(
      `Confirm checkout for ${itemsWithQuantity.length} item(s)?\n\nCustomer: ${form.customerName}\nAddress: ${form.customerAddress}`
    );

    if (!confirmed) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const checkoutData = {
        customer: {
          id: form.customerId,
          name: form.customerName,
          email: form.customerEmail,
          phone: form.customerPhone,
          address: form.customerAddress,
          isNew: form.isNewCustomer
        },
        items: itemsWithQuantity.map(item => ({
          id: item.id,
          quantity: item.selected_quantity
        })),
        notes: form.notes
      };

      const response = await fetch('/api/stock/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(checkoutData)
      });

      const result = await response.json();

      if (response.ok) {
        // Clear localStorage after successful checkout
        localStorage.removeItem('checkoutItems');
        localStorage.removeItem('checkoutForm');
        localStorage.removeItem('inventorySelectedItems');
        
        alert(`✅ Checkout successful!\n\nOrder processed for ${itemsWithQuantity.length} item(s)`);
        navigate('/inventory');
      } else {
        alert(`❌ Error: ${result.message}`);
      }
    } catch (error) {
      console.error('Error during checkout:', error);
      alert('❌ An error occurred during checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const totalValue = checkoutItems.reduce((sum, item) => 
    sum + (item.selected_quantity * (item.price || 0)), 0
  );

  const totalItems = checkoutItems.reduce((sum, item) => sum + item.selected_quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Checkout</h1>
            <button
              onClick={() => {
                // Pass back the selected items with their quantities
                const selectedItemsData = checkoutItems
                  .filter(item => item.selected_quantity > 0)
                  .map(item => ({
                    id: item.id,
                    selected_quantity: item.selected_quantity
                  }));
                
                navigate('/inventory', { 
                  state: { 
                    selectedItems: selectedItemsData,
                    preserveSelection: true 
                  } 
                });
              }}
              className="text-gray-500 hover:text-gray-700"
            >
              ← Back to Inventory
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Customer Information */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">Customer Information</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Customer
                  </label>
                  <select
                    value={form.isNewCustomer ? 'new' : form.customerId}
                    onChange={(e) => handleCustomerChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a customer...</option>
                    {customers.map(customer => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} - {customer.email}
                      </option>
                    ))}
                    <option value="new">+ Add New Customer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => setForm(prev => ({ ...prev, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={form.customerEmail}
                    onChange={(e) => setForm(prev => ({ ...prev, customerEmail: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={form.customerPhone}
                    onChange={(e) => setForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address *
                  </label>
                  <input
                    type="text"
                    value={form.customerAddress}
                    onChange={(e) => setForm(prev => ({ ...prev, customerAddress: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Quick Search */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">Quick Search</h2>
              <div className="relative search-container">
                <input
                  type="text"
                  placeholder="Search for products, brands, or codes..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowSearchResults(e.target.value.length > 0);
                  }}
                  onFocus={() => setShowSearchResults(searchTerm.length > 0)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                
                                 {showSearchResults && filteredInventory.length > 0 && (
                   <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                     {filteredInventory.slice(0, 10).map((item: any) => (
                      <div
                        key={item.id}
                        onClick={() => handleAddItem(item)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{item.product_name}</div>
                            <div className="text-sm text-gray-600">
                              {item.brand} • {item.product_code}
                            </div>
                          </div>
                          <div className="text-sm text-gray-500">
                            Available: {item.quantity}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {showSearchResults && searchTerm.length > 0 && filteredInventory.length === 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                    <div className="px-4 py-3 text-gray-500 text-center">
                      No items found matching "{searchTerm}"
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Items */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="text-lg font-semibold mb-4">Items to Checkout</h2>
              
              <div className="bg-white rounded-lg border overflow-hidden">
                {/* Table Header */}
                <div className="bg-gray-50 px-4 py-3 border-b">
                  <div className="grid grid-cols-8 gap-2">
                    <div className="col-span-5">
                      <h3 className="text-sm font-medium text-gray-700">Item Details</h3>
                    </div>
                    <div className="flex justify-center">
                      <h3 className="text-sm font-medium text-gray-700">Available</h3>
                    </div>
                    <div className="flex justify-center">
                      <h3 className="text-sm font-medium text-gray-700">Quantity</h3>
                    </div>
                    <div className="flex justify-center">
                      <h3 className="text-sm font-medium text-gray-700">Actions</h3>
                    </div>
                  </div>
                </div>
                
                {/* Table Rows */}
                <div className="divide-y divide-gray-200">
                  {checkoutItems.map((item) => (
                    <div key={item.id} className="px-4 py-3">
                      <div className="grid grid-cols-8 gap-2 items-center">
                        <div className="col-span-5">
                          <h3 className="font-medium text-gray-900">{item.product_name}</h3>
                          <p className="text-sm text-gray-600">
                            {item.brand} • {item.product_code}
                          </p>
                        </div>
                        
                        <div className="w-full flex justify-center">
                          <span className="text-sm text-gray-500 text-center">
                            {item.available_quantity}
                          </span>
                        </div>
                        
                        <div className="flex justify-center">
                          <input
                            type="number"
                            min="0"
                            max={item.available_quantity}
                            value={item.selected_quantity}
                            onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 0)}
                            className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                          />
                        </div>
                        
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="text-red-600 hover:text-red-800 p-1 rounded-full hover:bg-red-50 transition-colors"
                            title="Remove item from basket"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      
                      {item.selected_quantity > item.available_quantity && (
                        <p className="text-red-600 text-sm mt-2">
                          ⚠️ Insufficient quantity available
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Add any additional notes..."
              />
            </div>

            {/* Summary */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-2">Order Summary</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Total Items:</span>
                  <span className="ml-2 font-medium">{totalItems}</span>
                </div>
                <div>
                  <span className="text-gray-600">Total Value:</span>
                  <span className="ml-2 font-medium">${totalValue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate('/inventory')}
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || totalItems === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Complete Checkout'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Checkout; 