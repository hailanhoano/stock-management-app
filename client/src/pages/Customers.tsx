import React, { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../context/WebSocketContext';

interface Customer {
  id: string;
  _headers?: { [key: string]: string };
  [key: string]: any;
}

const Customers: React.FC = () => {
  const { syncStatus } = useWebSocket();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingCell, setEditingCell] = useState<{customerId: string, field: string} | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState<{[key: string]: string}>({});
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [lastCustomerSync, setLastCustomerSync] = useState<Date | null>(null);

  // Load customers data
  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/customers', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customer data');
      }

      const data = await response.json();
      setCustomers(data.customers || []);
      setLastCustomerSync(new Date());
    } catch (error) {
      console.error('Error loading customers:', error);
      setError('Failed to load customer data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Handle cell editing
  const handleCellClick = (customerId: string, field: string, currentValue: string) => {
    setEditingCell({ customerId, field });
    setEditValue(currentValue || '');
  };

  const handleCellSave = async () => {
    if (!editingCell) return;
    
    try {
      // Update customer locally first
      setCustomers(prevCustomers => 
        prevCustomers.map(customer => 
          customer.id === editingCell.customerId 
            ? { ...customer, [editingCell.field]: editValue }
            : customer
        )
      );
      
      // Here you could add an API call to save back to Google Sheets
      console.log('Would save:', editingCell.customerId, editingCell.field, editValue);
      
      setEditingCell(null);
      setEditValue('');
    } catch (error) {
      console.error('Error saving customer:', error);
      setError('Failed to save changes');
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setEditValue('');
  };

  // Handle adding new customer
  const handleAddCustomer = () => {
    setShowAddForm(true);
    const headers = getHeaders();
    const initialCustomer: {[key: string]: string} = {};
    headers.forEach(header => {
      initialCustomer[header] = '';
    });
    setNewCustomer(initialCustomer);
  };

  const handleSaveNewCustomer = async () => {
    try {
      const newId = `customer_${Date.now()}`;
      const customerToAdd = {
        ...newCustomer,
        id: newId,
        _headers: customers.length > 0 ? customers[0]._headers : {}
      };
      
      setCustomers(prevCustomers => [customerToAdd, ...prevCustomers]);
      setShowAddForm(false);
      setNewCustomer({});
      
      // Here you could add an API call to save back to Google Sheets
      console.log('Would add new customer:', customerToAdd);
    } catch (error) {
      console.error('Error adding customer:', error);
      setError('Failed to add customer');
    }
  };

  const handleCancelAddCustomer = () => {
    setShowAddForm(false);
    setNewCustomer({});
  };

  // Manual sync function for customers
  const handleManualSync = useCallback(async () => {
    try {
      setIsManualSyncing(true);
      console.log('🔄 Manual customer sync triggered by user');
      
      const token = localStorage.getItem('token');
      
      // Call the manual sync endpoint
      const syncResponse = await fetch('http://localhost:3001/api/sync/manual', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!syncResponse.ok) {
        throw new Error('Failed to trigger sync');
      }

      // Refresh customer data without showing loading state
      const response = await fetch('http://localhost:3001/api/customers', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customer data');
      }

      const data = await response.json();
      setCustomers(data.customers || []);
      setLastCustomerSync(new Date());
      setError(null);
      
      console.log('✅ Manual customer sync completed');
    } catch (error) {
      console.error('❌ Manual customer sync failed:', error);
      setError('Failed to sync customer data manually');
    } finally {
      setIsManualSyncing(false);
    }
  }, []);

  // Get display name for header
  const getDisplayHeader = (key: string) => {
    if (customers.length > 0 && customers[0]._headers && customers[0]._headers[key]) {
      return customers[0]._headers[key]; // Use original Vietnamese header
    }
    
    // Fallback to English mapping
    const englishHeaderMapping: { [key: string]: string } = {
      // Your actual sheet headers
      'customer_number': 'Customer Number',
      'company_name': 'Company Name',
      'contact': 'Contact',
      'location': 'Location',
      
      // Common headers
      'customer_name': 'Customer Name',
      'address': 'Address',
      'phone': 'Phone',
      'email': 'Email',
      'customer_code': 'Customer Code',
      'birth_date': 'Birth Date',
      'gender': 'Gender',
      'occupation': 'Occupation',
      'notes': 'Notes',
      'status': 'Status',
      'created_date': 'Created Date',
      'created_by': 'Created By',
      'customer_type': 'Customer Type',
      'company': 'Company',
      'tax_code': 'Tax Code',
      'country': 'Country',
      'city': 'City',
      'district': 'District',
      'ward': 'Ward',
      'postal_code': 'Postal Code',
      'industry': 'Industry',
      'website': 'Website',
      'fax': 'Fax',
      'position': 'Position',
      'department': 'Department',
      'customer_source': 'Customer Source',
      'priority_level': 'Priority Level',
      'revenue': 'Revenue',
      'bank': 'Bank',
      'account_number': 'Account Number',
      'credit_score': 'Credit Score',
      'credit_limit': 'Credit Limit',
      'preferences': 'Preferences',
      'primary_contact': 'Primary Contact',
      'referrer': 'Referrer',
      'sales_channel': 'Sales Channel',
      'customer_group': 'Customer Group'
    };
    
    return englishHeaderMapping[key] || key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Get column headers from first customer
  const getHeaders = () => {
    if (customers.length === 0) return [];
    const firstCustomer = customers[0];
    return Object.keys(firstCustomer).filter(key => key !== 'id' && key !== '_headers');
  };

  // Get column width classes based on header content
  const getColumnWidthClasses = (header: string) => {
    const displayHeader = getDisplayHeader(header);
    
    // Check for company column (Công ty)
    if (displayHeader.toLowerCase().includes('công ty')) {
      return 'min-w-64 max-w-80'; // 2x wider (from 32->64, 60->80)
    }
    
    // Check for address column (Địa chỉ)
    if (displayHeader.toLowerCase().includes('địa chỉ')) {
      return 'min-w-96 max-w-none'; // 3x wider (from 32->96, unlimited max)
    }
    
    // Default width for other columns
    return 'min-w-32 max-w-60';
  };

  // Filter customers based on search term
  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchTerm.toLowerCase();
    return Object.entries(customer).some(([key, value]) => {
      if (key === 'id' || key === '_headers') return false;
      
      // Search in the value
      const valueMatch = value && value.toString().toLowerCase().includes(searchLower);
      
      // Also search in the header names (both Vietnamese and English)
      const headerMatch = getDisplayHeader(key).toLowerCase().includes(searchLower);
      
      return valueMatch || headerMatch;
    });
  });

  const headers = getHeaders();

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading customer data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Information</h1>
          <p className="mt-1 text-sm text-gray-500">
            Customer database synced from Google Sheets
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center space-x-4">
          {/* Sync Status */}
          <div className="flex flex-col space-y-1 text-sm">
            <div className="text-xs text-gray-500 flex items-center">
              Last sync: {lastCustomerSync ? lastCustomerSync.toLocaleTimeString() : 'Unknown'}
              <span 
                className="inline-block w-5 ml-1 cursor-pointer hover:bg-gray-100 rounded p-1 transition-colors"
                onClick={handleManualSync}
                title={isManualSyncing || syncStatus === 'syncing' ? 'Syncing...' : 'Click to sync now'}
              >
                {isManualSyncing || syncStatus === 'syncing' ? (
                  <span className="text-blue-600 animate-spin">🔄</span>
                ) : syncStatus === 'error' ? (
                  <span className="text-red-600 hover:text-red-800">❌</span>
                ) : (
                  <span className="text-blue-600 hover:text-blue-800">🔄</span>
                )}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3">
            <button
              onClick={handleAddCustomer}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              ➕ Add Customer
            </button>
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

      {/* Search and Stats */}
      <div className="bg-white rounded-lg shadow">
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
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
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
              {filteredCustomers.length} of {customers.length} customers
            </span>
          </div>
        </div>
      </div>

      {/* Add Customer Form */}
      {showAddForm && (
        <div className="bg-white shadow sm:rounded-md border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Add New Customer</h3>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {headers.map((header) => (
                <div key={header}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {getDisplayHeader(header)}
                  </label>
                  <input
                    type="text"
                    value={newCustomer[header] || ''}
                    onChange={(e) => setNewCustomer(prev => ({
                      ...prev,
                      [header]: e.target.value
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={`Enter ${getDisplayHeader(header).toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={handleCancelAddCustomer}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewCustomer}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Save Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Table */}
      {customers.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
            <table className="w-full divide-y divide-gray-200 table-auto">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  {headers.map((header) => (
                    <th
                      key={header}
                      className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${getColumnWidthClasses(header)}`}
                    >
                      <div className="break-words">
                        {getDisplayHeader(header)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredCustomers.map((customer, index) => (
                  <tr 
                    key={customer.id} 
                    className={`hover:bg-blue-50 ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    {headers.map((header) => (
                      <td
                        key={header}
                        className={`px-6 py-4 text-sm text-gray-900 cursor-pointer transition-colors duration-150 hover:bg-blue-100 ${getColumnWidthClasses(header)}`}
                        onClick={() => handleCellClick(customer.id, header, customer[header] || '')}
                      >
                        {editingCell?.customerId === customer.id && editingCell?.field === header ? (
                          <div className="flex items-start space-x-2">
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleCellSave();
                                }
                                if (e.key === 'Escape') handleCellCancel();
                              }}
                              className="w-full px-2 py-1 border border-blue-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none min-h-8 max-h-32 overflow-y-auto"
                              autoFocus
                              rows={1}
                              style={{
                                height: 'auto',
                                minHeight: '32px'
                              }}
                              onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                              }}
                            />
                            <div className="flex flex-col space-y-1">
                              <div className="flex space-x-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCellSave();
                                  }}
                                  className="p-1 text-green-600 hover:text-green-800 bg-green-50 hover:bg-green-100 rounded"
                                  title="Save (Enter)"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCellCancel();
                                  }}
                                  className="p-1 text-red-600 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded"
                                  title="Cancel (Esc)"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                              {editValue.length > 30 && (
                                <div className="text-xs text-gray-500 whitespace-nowrap">
                                  {editValue.length} chars
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="group relative">
                            <span 
                              className="block break-words word-wrap overflow-wrap hyphens-auto leading-relaxed" 
                              title={`${customer[header] || 'No data'} - Click to edit`}
                            >
                              {customer[header] || '-'}
                            </span>
                            {customer[header] && customer[header].length > 50 && (
                              <div className="absolute -top-1 -right-1 bg-blue-100 text-blue-600 text-xs px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                {customer[header].length} chars
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow sm:rounded-md p-8">
          <div className="text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No customers found</h3>
            <p className="mt-1 text-sm text-gray-500">
              No customer data available. Please check your Google Sheets configuration.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers; 