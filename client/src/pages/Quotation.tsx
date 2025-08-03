import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../context/WebSocketContext';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import QuotationHeader from '../components/QuotationHeader';
import QuotationFooter from '../components/QuotationFooter';
import { 
  PlusIcon, 
  TrashIcon, 
  ClipboardDocumentIcon,
  DocumentTextIcon,
  UserIcon,
  CalculatorIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  PencilIcon
} from '@heroicons/react/24/outline';

interface QuotationItem {
  id: string;
  product_code: string;
  product_name: string;
  brand: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_price: number;
  notes: string;
}

interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  attentionTo?: string;
}

interface Quotation {
  id: string;
  quotation_number: string;
  customer: Customer | null;
  items: QuotationItem[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string;
  created_date: string;
  valid_until: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
}

const Quotation: React.FC = () => {
  const navigate = useNavigate();
  const { isConnected } = useWebSocket();
  const { user } = useAuth();
  
  // Duration state for expiry date
  const [expiryDuration, setExpiryDuration] = useState(() => {
    const saved = localStorage.getItem('quotation_expiryDuration');
    return saved ? parseInt(saved) : 30;
  });

  // Quotation number state
  const [quotationNumber, setQuotationNumber] = useState(() => {
    const saved = localStorage.getItem('quotation_number');
    return saved || '10935';
  });

  // Available quotation numbers state
  const [availableQuotationNumbers, setAvailableQuotationNumbers] = useState<string[]>([]);
  const [loadingQuotationNumbers, setLoadingQuotationNumbers] = useState(false);
  const [showQuotationDropdown, setShowQuotationDropdown] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Helper function to get default expiry date in DD-MM-YYYY format
  const getDefaultExpiryDate = () => {
    const date = new Date(Date.now() + expiryDuration * 24 * 60 * 60 * 1000);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };
  
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [currentQuotation, setCurrentQuotation] = useState<Quotation | null>(null);
  const [expandedQuotations, setExpandedQuotations] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form states with localStorage persistence
  const [customer, setCustomer] = useState<Customer | null>(() => {
    const saved = localStorage.getItem('quotation_customer');
    return saved ? JSON.parse(saved) : null;
  });
  const [items, setItems] = useState<QuotationItem[]>(() => {
    const saved = localStorage.getItem('quotation_items');
    return saved ? JSON.parse(saved) : [];
  });
  const [notes, setNotes] = useState(() => {
    const saved = localStorage.getItem('quotation_notes');
    return saved || '';
  });
  const [taxRate, setTaxRate] = useState(() => {
    const saved = localStorage.getItem('quotation_taxRate');
    return saved ? parseFloat(saved) : 0;
  });
  const [validUntil, setValidUntil] = useState(() => {
    const saved = localStorage.getItem('quotation_validUntil');
    return saved || '';
  });

  // Header and footer state with localStorage persistence
  const [headerDate, setHeaderDate] = useState(() => {
    const saved = localStorage.getItem('quotation_headerDate');
    return saved || new Date().toLocaleDateString('en-GB');
  });
  const [headerSalesRep, setHeaderSalesRep] = useState(() => {
    const saved = localStorage.getItem('quotation_headerSalesRep');
    return saved || 'Tam Giang - 0916999013';
  });
  const [headerSalesEmail, setHeaderSalesEmail] = useState(() => {
    const saved = localStorage.getItem('quotation_headerSalesEmail');
    return saved || 'admin@example.com';
  });
  const [headerSalesPhone, setHeaderSalesPhone] = useState(() => {
    const saved = localStorage.getItem('quotation_headerSalesPhone');
    return saved || '0916999013';
  });

  // Footer state with localStorage persistence
  const [footerValidUntil, setFooterValidUntil] = useState(() => {
    const saved = localStorage.getItem('quotation_footerValidUntil');
    return saved || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');
  });
  
  // Paste functionality
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteData, setPasteData] = useState('');
  const [pasteType, setPasteType] = useState<'inventory' | 'manual'>('inventory');
  const pasteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Customer search functionality
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  // Shared expiry date state (like Excel)
  const [expiryDate, setExpiryDate] = useState(() => {
    const saved = localStorage.getItem('quotation_expiryDate');
    return saved || getDefaultExpiryDate();
  });

  // Load quotations on component mount
  useEffect(() => {
    loadQuotations();
    loadCustomers();
    loadQuotationNumbers(); // Load available quotation numbers
  }, []);

  // Save form data to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('quotation_customer', JSON.stringify(customer));
  }, [customer]);

  useEffect(() => {
    localStorage.setItem('quotation_items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    localStorage.setItem('quotation_notes', notes);
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('quotation_taxRate', taxRate.toString());
  }, [taxRate]);

  useEffect(() => {
    localStorage.setItem('quotation_validUntil', validUntil);
  }, [validUntil]);

  // Save header data to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('quotation_headerDate', headerDate);
  }, [headerDate]);

  useEffect(() => {
    localStorage.setItem('quotation_headerSalesRep', headerSalesRep);
  }, [headerSalesRep]);

  useEffect(() => {
    localStorage.setItem('quotation_headerSalesEmail', headerSalesEmail);
  }, [headerSalesEmail]);

  useEffect(() => {
    localStorage.setItem('quotation_headerSalesPhone', headerSalesPhone);
  }, [headerSalesPhone]);

  // Save footer data to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('quotation_footerValidUntil', footerValidUntil);
  }, [footerValidUntil]);

  // Save expiry date to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('quotation_expiryDate', expiryDate);
  }, [expiryDate]);

  // Save duration to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('quotation_expiryDuration', expiryDuration.toString());
  }, [expiryDuration]);

  // Save quotation number to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('quotation_number', quotationNumber);
  }, [quotationNumber]);

  // Auto-fetch items when quotation number changes
  useEffect(() => {
    if (quotationNumber && quotationNumber.trim()) {
      handleFetchFromGoogleSheets();
    }
  }, [quotationNumber]);

  // Update expiry date when duration changes
  useEffect(() => {
    setExpiryDate(getDefaultExpiryDate());
  }, [expiryDuration]);

  // Calculate and update duration when expiry date changes (from header)
  useEffect(() => {
    if (expiryDate && !isResetting) {
      const today = new Date();
      const expiry = new Date(expiryDate.split('-').reverse().join('-'));
      const diffTime = expiry.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0 && diffDays <= 365) {
        setExpiryDuration(diffDays);
      }
    }
  }, [expiryDate, isResetting]);

  // Load customers from API
  const loadCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/customers', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Loaded customers:', data);
        setCustomers(data.customers || []);
      } else {
        console.error('Failed to load customers:', response.status);
      }
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  // Filter customers based on search term
  const filteredCustomers = customers.filter(customer => {
    if (!customerSearchTerm) return false;
    const searchLower = customerSearchTerm.toLowerCase();
    return (
      customer.company_name?.toLowerCase().includes(searchLower) ||
      customer.customer_number?.toLowerCase().includes(searchLower) ||
      customer.contact?.toLowerCase().includes(searchLower) ||
      customer.address?.toLowerCase().includes(searchLower) ||
      customer.tax_code?.toLowerCase().includes(searchLower)
    );
  });

  // Handle click outside to close customer search
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.customer-search-container')) {
        setShowCustomerResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadQuotations = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/quotations', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setQuotations(data);
      } else {
        setError('Failed to load quotations');
      }
    } catch (err) {
      setError('Error loading quotations');
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = (items: QuotationItem[], taxRate: number) => {
    const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  };

  const handleAddItem = () => {
    const newItem: QuotationItem = {
      id: Date.now().toString(),
      product_code: '',
      product_name: '',
      brand: '',
      quantity: 1,
      unit: 'pcs',
      unit_price: 0,
      total_price: 0,
      notes: ''
    };
    setItems([...items, newItem]);
  };

  const handleUpdateItem = (id: string, field: keyof QuotationItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'quantity' || field === 'unit_price') {
          updatedItem.total_price = updatedItem.quantity * updatedItem.unit_price;
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handlePasteData = () => {
    setShowPasteModal(true);
  };

  const handleCustomerSelect = (selectedCustomer: any) => {
    const contactInfo = selectedCustomer.contact || '';
    const contactParts = contactInfo.split('-').map((s: string) => s.trim());
    const name = contactParts[0] || '';
    const phone = contactParts[1] || '';
    const email = contactParts[2] || '';
    
    const extractEmailFromContact = (contact: string): string => {
      if (!contact) return '';
      const emailMatch = contact.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      return emailMatch ? emailMatch[0] : '';
    };

    const extractPhoneFromContact = (contact: string): string => {
      if (!contact) return '';
      const phoneMatch = contact.match(/[\d\s\-\+\(\)]{8,}/);
      return phoneMatch ? phoneMatch[0].trim() : '';
    };

    const extractedEmail = extractEmailFromContact(contactInfo);
    const extractedPhone = extractPhoneFromContact(contactInfo);
    
    setCustomer({
      id: selectedCustomer.id,
      name: selectedCustomer.company_name || selectedCustomer.customer_name || name || 'Unknown Customer',
      email: extractedEmail || email || '',
      phone: extractedPhone || phone || '',
      address: `${selectedCustomer.address || ''} ${selectedCustomer.ward || ''} ${selectedCustomer.location || ''}`.trim()
    });
    setCustomerSearchTerm('');
    setShowCustomerResults(false);
  };

  const processPastedData = () => {
    if (!pasteData.trim()) return;

    const lines = pasteData.trim().split('\n');
    const newItems: QuotationItem[] = [];

    lines.forEach((line, index) => {
      if (line.trim()) {
        const columns = line.split('\t');
        
        if (pasteType === 'inventory') {
          if (columns.length >= 6) {
            const newItem: QuotationItem = {
              id: `pasted-${Date.now()}-${index}`,
              product_code: columns[0]?.trim() || '',
              product_name: columns[1]?.trim() || '',
              brand: columns[2]?.trim() || '',
              quantity: parseFloat(columns[3]?.trim() || '1'),
              unit: columns[4]?.trim() || 'pcs',
              unit_price: parseFloat(columns[5]?.trim() || '0'),
              total_price: parseFloat(columns[3]?.trim() || '1') * parseFloat(columns[5]?.trim() || '0'),
              notes: columns[6]?.trim() || ''
            };
            newItems.push(newItem);
          }
        } else {
          const newItem: QuotationItem = {
            id: `manual-${Date.now()}-${index}`,
            product_code: columns[0]?.trim() || '',
            product_name: columns[1]?.trim() || '',
            brand: columns[2]?.trim() || '',
            quantity: parseFloat(columns[3]?.trim() || '1'),
            unit: columns[4]?.trim() || 'pcs',
            unit_price: parseFloat(columns[5]?.trim() || '0'),
            total_price: parseFloat(columns[3]?.trim() || '1') * parseFloat(columns[5]?.trim() || '0'),
            notes: columns[6]?.trim() || ''
          };
          newItems.push(newItem);
        }
      }
    });

    setItems([...items, ...newItems]);
    setShowPasteModal(false);
    setPasteData('');
  };

  const handleSaveQuotation = async () => {
    if (!customer) {
      setError('Please select a customer');
      return;
    }

    if (items.length === 0) {
      setError('Please add at least one item');
      return;
    }

    const { subtotal, taxAmount, total } = calculateTotals(items, taxRate);
    
    const quotation: Quotation = {
      id: Date.now().toString(),
      quotation_number: `QT-${Date.now()}`,
      customer,
      items,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      notes,
      created_date: new Date().toISOString(),
      valid_until: validUntil,
      status: 'draft'
    };

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const response = await fetch('/api/quotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(quotation),
      });

      if (response.ok) {
        setQuotations([quotation, ...quotations]);
        setError(null);
      } else {
        setError('Failed to save quotation');
      }
    } catch (err) {
      setError('Error saving quotation');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIsResetting(true);
    
    setCustomer(null);
    setItems([]);
    setNotes('');
    setTaxRate(0);
    setValidUntil('');
    // Reset header data
    setHeaderDate(new Date().toLocaleDateString('en-GB'));
    setHeaderSalesRep('Tam Giang - 0916999013');
    setHeaderSalesEmail('admin@example.com');
    setHeaderSalesPhone('0916999013');
    // Reset duration and expiry date together to avoid circular dependency
    const newDuration = 30;
    setExpiryDuration(newDuration);
    // Calculate new expiry date based on the reset duration
    const newExpiryDate = new Date(Date.now() + newDuration * 24 * 60 * 60 * 1000);
    const day = newExpiryDate.getDate().toString().padStart(2, '0');
    const month = (newExpiryDate.getMonth() + 1).toString().padStart(2, '0');
    const year = newExpiryDate.getFullYear();
    setExpiryDate(`${day}-${month}-${year}`);
    // Reset quotation number
    setQuotationNumber('');
    // Reload quotation numbers
    loadQuotationNumbers();
    // Clear localStorage
    localStorage.removeItem('quotation_customer');
    localStorage.removeItem('quotation_items');
    localStorage.removeItem('quotation_notes');
    localStorage.removeItem('quotation_taxRate');
    localStorage.removeItem('quotation_validUntil');
    localStorage.removeItem('quotation_headerDate');
    localStorage.removeItem('quotation_headerSalesRep');
    localStorage.removeItem('quotation_headerSalesEmail');
    localStorage.removeItem('quotation_headerSalesPhone');
    localStorage.removeItem('quotation_expiryDate');
    localStorage.removeItem('quotation_expiryDuration');
    localStorage.removeItem('quotation_number');
    
    // Reset the flag after a short delay to allow state updates to complete
    setTimeout(() => {
      setIsResetting(false);
    }, 100);
  };

  const toggleQuotationExpansion = (quotationId: string) => {
    const newExpanded = new Set(expandedQuotations);
    if (newExpanded.has(quotationId)) {
      newExpanded.delete(quotationId);
    } else {
      newExpanded.add(quotationId);
    }
    setExpandedQuotations(newExpanded);
  };

  const { subtotal, taxAmount, total } = calculateTotals(items, taxRate);

  // Function to fetch items from Google Sheets via server
  const fetchItemsFromGoogleSheets = async (quotationNumber: string) => {
    try {
      console.log(`Fetching items for quotation number: ${quotationNumber}`);
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:3001/api/quotation-items/${quotationNumber}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Response from server:', data);
      return data.items || [];
    } catch (error) {
      console.error('Error fetching from Google Sheets:', error);
      return [];
    }
  };

  // Function to handle fetching items from Google Sheets
  const handleFetchFromGoogleSheets = async () => {
    setLoading(true);
    
    try {
      const fetchedItems = await fetchItemsFromGoogleSheets(quotationNumber);
      if (fetchedItems.length > 0) {
        setItems(fetchedItems);
        // Save to localStorage
        localStorage.setItem('quotation_items', JSON.stringify(fetchedItems));
        console.log(`Successfully loaded ${fetchedItems.length} items for quotation ${quotationNumber}`);
      } else {
        console.log(`No items found for quotation number: ${quotationNumber}`);
        // Don't show popup, just log to console
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      // Don't show popup, just log to console
    } finally {
      setLoading(false);
    }
  };

  // Function to test Google Sheets connection
  const testGoogleSheetsConnection = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/test-sheets', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Google Sheets test result:', data);
      alert(`Available sheets: ${data.availableSheets.join(', ')}\nFirst sheet: ${data.firstSheet}\nTest data rows: ${data.testData.length}`);
    } catch (error) {
      console.error('Error testing Google Sheets:', error);
      alert('Error testing Google Sheets connection');
    }
  };

  // Function to load available quotation numbers
  const loadQuotationNumbers = async () => {
    try {
      setLoadingQuotationNumbers(true);
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:3001/api/quotation-numbers', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setAvailableQuotationNumbers(data.quotationNumbers || []);
      console.log('Available quotation numbers:', data.quotationNumbers);
    } catch (error) {
      console.error('Error loading quotation numbers:', error);
    } finally {
      setLoadingQuotationNumbers(false);
    }
  };

  const autoResizeTextarea = (element: HTMLTextAreaElement) => {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
  };

  const handleTextareaChange = (id: string, field: keyof QuotationItem, value: string, element: HTMLTextAreaElement) => {
    handleUpdateItem(id, field, value);
    autoResizeTextarea(element);
  };

  // Auto-resize textareas when items change
  useEffect(() => {
    const textareas = document.querySelectorAll('textarea');
    textareas.forEach(textarea => {
      autoResizeTextarea(textarea as HTMLTextAreaElement);
    });
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quotations</h1>
          <p className="text-gray-600">Create and manage customer quotations</p>
        </div>
        <button
          onClick={resetForm}
          className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Reset Form
        </button>
      </div>

      {/* Main Content - New Quotation Form */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            {/* Quotation Header */}
            <QuotationHeader 
              quotationNumber={quotationNumber}
              date={headerDate}
              expiryDate={expiryDate}
              salesRep={headerSalesRep}
              salesEmail={headerSalesEmail}
              salesPhone={headerSalesPhone}
              availableQuotationNumbers={availableQuotationNumbers}
              loadingQuotationNumbers={loadingQuotationNumbers}
              onDateChange={(date) => {
                setHeaderDate(date);
              }}
              onExpiryDateChange={(newExpiryDate) => {
                setExpiryDate(newExpiryDate);
              }}
              onSalesRepChange={(salesRep, email, phone) => {
                setHeaderSalesRep(salesRep);
                setHeaderSalesEmail(email);
                setHeaderSalesPhone(phone);
              }}
              onQuotationNumberChange={(number) => {
                setQuotationNumber(number);
              }}
            />
            
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-medium text-gray-900">Create New Quotation</h3>
              <div className="text-sm text-gray-600 flex items-center">
                <span className="font-medium">Today:</span> {new Date().toLocaleDateString('en-GB')} | 
                <span className="font-medium ml-2">Expiry Date duration:</span> 
                <input
                  type="number"
                  value={expiryDuration}
                  onChange={(e) => setExpiryDuration(parseInt(e.target.value) || 30)}
                  className="ml-1 w-16 text-center border border-gray-300 rounded px-1 text-sm"
                  min="1"
                  max="365"
                />
                <span className="ml-1">days</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Customer Information */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900 flex items-center">
                    <UserIcon className="h-5 w-5 mr-2" />
                    Customer Information
                  </h4>
                  <div className="relative customer-search-container w-80">
                    <input
                      type="text"
                      placeholder="Search customers..."
                      value={customerSearchTerm}
                      onChange={(e) => {
                        setCustomerSearchTerm(e.target.value);
                        setShowCustomerResults(e.target.value.length > 0);
                      }}
                      onFocus={() => setShowCustomerResults(customerSearchTerm.length > 0)}
                      className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {loadingCustomers && (
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                      </div>
                    )}
                    
                    {showCustomerResults && filteredCustomers.length > 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {filteredCustomers.slice(0, 8).map((customer) => (
                          <div
                            key={customer.id}
                            onClick={() => handleCustomerSelect(customer)}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 text-sm"
                          >
                            <div className="font-medium text-gray-900">
                              {customer.company_name || customer.customer_number || 'Unknown Company'}
                            </div>
                            <div className="text-xs text-gray-600">
                              {customer.contact && (
                                <span className="block">{customer.contact}</span>
                              )}
                              {customer.customer_number && (
                                <span className="text-blue-600">Code: {customer.customer_number}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {showCustomerResults && customerSearchTerm.length > 0 && filteredCustomers.length === 0 && (
                      <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                        <div className="px-3 py-2 text-gray-500 text-center text-sm">
                          No customers found
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {customer && (
                  <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start">
                        <span className="text-blue-600 mr-3 mt-1">✅</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium text-blue-800 mb-2">
                            {customer.name}
                          </div>
                          
                          <div className="space-y-1 text-xs text-blue-700">
                            {customer.name && (
                              <div>🏢 Company: {customer.name}</div>
                            )}
                            {customer.phone && (
                              <div>📞 Phone: {customer.phone}</div>
                            )}
                            {customer.email && (
                              <div>📧 Email: {customer.email}</div>
                            )}
                            {customer.address && (
                              <div>📍 Address: {customer.address}</div>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setCustomer(null)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer Details (Editable) - Moved here */}
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900 flex items-center">
                  <DocumentTextIcon className="h-5 w-5 mr-2" />
                  Customer Details (Editable)
                </h4>
                
                {customer && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Company Name</label>
                        <textarea
                          value={customer.name}
                          onChange={(e) => setCustomer({...customer, name: e.target.value})}
                          rows={2}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Phone</label>
                        <input
                          type="text"
                          value={customer.phone}
                          onChange={(e) => setCustomer({...customer, phone: e.target.value})}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Email</label>
                        <input
                          type="email"
                          value={customer.email}
                          onChange={(e) => setCustomer({...customer, email: e.target.value})}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Attention to</label>
                        <input
                          type="text"
                          value={customer.attentionTo || ''}
                          onChange={(e) => setCustomer({...customer, attentionTo: e.target.value})}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <textarea
                          value={customer.address}
                          onChange={(e) => setCustomer({...customer, address: e.target.value})}
                          rows={2}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              </div>

            {/* Items Section */}
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h4 className="font-medium text-gray-900 flex items-center">
                  <CalculatorIcon className="h-5 w-5 mr-2" />
                  Items
                </h4>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <label className="text-sm font-medium text-gray-700">Quotation #:</label>
                    <div className="relative">
                    <input
                        type="text"
                        value={quotationNumber}
                        onChange={(e) => setQuotationNumber(e.target.value)}
                        onFocus={() => setShowQuotationDropdown(true)}
                        onBlur={() => setTimeout(() => setShowQuotationDropdown(false), 200)}
                        className="w-32 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder={loadingQuotationNumbers ? "Loading..." : "Type or select..."}
                        disabled={loadingQuotationNumbers}
                      />
                      {loadingQuotationNumbers && (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <div className="h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
                  </div>
                      )}
                      {showQuotationDropdown && availableQuotationNumbers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {availableQuotationNumbers
                            .filter(number => 
                              number.toLowerCase().includes(quotationNumber.toLowerCase())
                            )
                            .map(number => (
                              <div
                                key={number}
                                onClick={() => {
                                  setQuotationNumber(number);
                                  setShowQuotationDropdown(false);
                                }}
                                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                              >
                                {number}
                  </div>
                            ))}
                </div>
                      )}
              </div>
            </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handlePasteData}
                    className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <ClipboardDocumentIcon className="h-4 w-4 mr-1" />
                    Paste Data
                  </button>
                  <button
                    onClick={handleAddItem}
                    className="inline-flex items-center px-3 py-1 border border-transparent text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    <PlusIcon className="h-4 w-4 mr-1" />
                    Add Item
                  </button>
                  </div>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <CalculatorIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-500 mb-2">No items added yet</p>
                  <p className="text-sm text-gray-400">Add items manually or paste from inventory</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0 z-10">
                      <tr>
                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                          Stt
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">
                          Hãng
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">
                          Mã
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-3/12">
                          Tên Hàng
                        </th>
                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">
                          Quy Cách
                        </th>
                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8">
                          SL
                        </th>
                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">
                          Đơn giá (₫)
                        </th>
                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-1/12">
                          Thành Tiền (₫)
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-2/12">
                          Ghi chú
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((item, index) => (
                        <tr key={item.id} className={`hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-green-50'}`}>
                          <td className="px-2 py-2 align-top">
                            <div className="text-sm text-gray-900">
                              {index + 1}
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-start h-full">
                              <textarea
                                value={item.brand}
                                onChange={(e) => handleTextareaChange(item.id, 'brand', e.target.value, e.target)}
                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                                style={{ minHeight: '32px', maxHeight: '120px' }}
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-start h-full">
                              <textarea
                            value={item.product_code}
                                onChange={(e) => handleTextareaChange(item.id, 'product_code', e.target.value, e.target)}
                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                                style={{ minHeight: '32px', maxHeight: '120px' }}
                          />
                        </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-start h-full">
                              <textarea
                            value={item.product_name}
                                onChange={(e) => handleTextareaChange(item.id, 'product_name', e.target.value, e.target)}
                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                                style={{ minHeight: '32px', maxHeight: '120px' }}
                          />
                        </div>
                          </td>
                          <td className="px-2 py-2 align-top">
                          <input
                            type="text"
                              value={item.unit}
                              onChange={(e) => handleUpdateItem(item.id, 'unit', e.target.value)}
                              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                          </td>
                          <td className="px-2 py-2 align-top">
                          <input
                              type="text"
                              value={item.quantity ? item.quantity.toLocaleString('en-US') : ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^\d]/g, '');
                                handleUpdateItem(item.id, 'quantity', parseFloat(value) || 0);
                              }}
                              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                          />
                          </td>
                          <td className="px-2 py-2 align-top">
                          <input
                            type="text"
                              value={item.unit_price ? item.unit_price.toLocaleString('en-US') : ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^\d]/g, '');
                                handleUpdateItem(item.id, 'unit_price', parseFloat(value) || 0);
                              }}
                              className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm text-right"
                              placeholder="0"
                              style={{ textAlign: 'right' }}
                            />
                          </td>
                          <td className="px-2 py-2 align-top">
                            <div className="text-sm font-medium text-gray-900 text-right" style={{ textAlign: 'right' }}>
                              {item.total_price.toLocaleString('en-US')}
                        </div>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-start h-full">
                              <textarea
                                value={item.notes}
                                onChange={(e) => handleTextareaChange(item.id, 'notes', e.target.value, e.target)}
                                className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                                style={{ minHeight: '32px', maxHeight: '120px' }}
                          />
                        </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Totals */}
            {items.length > 0 && (
              <div className="mt-6 border-t pt-6">
                <div className="flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tổng cộng:</span>
                      <span className="font-medium">{subtotal.toLocaleString('en-US')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Thuế ({taxRate}%):</span>
                      <span className="font-medium">{taxAmount.toLocaleString('en-US')}</span>
                    </div>
                    <div className="flex justify-between text-lg font-bold border-t pt-2">
                      <span>Tổng tiền:</span>
                      <span>{total.toLocaleString('en-US')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Add any additional notes..."
              />
            </div>

            {/* Quotation Footer */}
            <QuotationFooter 
              validUntil={expiryDate}
              onValidUntilChange={(newExpiryDate) => {
                setExpiryDate(newExpiryDate);
              }}
            />

            {/* Actions */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={handleSaveQuotation}
                disabled={loading || !customer || items.length === 0}
                className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save Quotation'}
              </button>
            </div>
          </div>
        </div>

      {/* Recent Quotations - Expandable Tabs */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Quotations</h3>
          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : quotations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <DocumentTextIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>No quotations created yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {quotations.map((quotation) => (
                <div key={quotation.id} className="border rounded-lg">
                  {/* Quotation Header - Always Visible */}
                  <div 
                    className="flex justify-between items-center p-4 hover:bg-gray-50 cursor-pointer"
                    onClick={() => toggleQuotationExpansion(quotation.id)}
                  >
                    <div className="flex items-center space-x-3">
                      {expandedQuotations.has(quotation.id) ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                      ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                      )}
                      <div>
                        <h4 className="font-medium text-gray-900">{quotation.quotation_number}</h4>
                        <p className="text-sm text-gray-600">{quotation.customer?.name}</p>
                        <p className="text-xs text-gray-500">
                          Created: {new Date(quotation.created_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="text-right">
                        <p className="font-medium text-gray-900">${quotation.total.toFixed(2)}</p>
                        <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          quotation.status === 'draft' ? 'bg-gray-100 text-gray-800' :
                          quotation.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                          quotation.status === 'accepted' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {quotation.status}
                        </span>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // View quotation details
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="View details"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Edit quotation
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600"
                          title="Edit quotation"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quotation Details - Expandable */}
                  {expandedQuotations.has(quotation.id) && (
                    <div className="border-t border-gray-200 p-4 bg-gray-50">
                      <div className="space-y-4">
                        {/* Customer Info */}
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Customer Information</h5>
                          <div className="text-sm text-gray-600">
                            <p><strong>Name:</strong> {quotation.customer?.name}</p>
                            <p><strong>Phone:</strong> {quotation.customer?.phone}</p>
                            <p><strong>Email:</strong> {quotation.customer?.email}</p>
                            <p><strong>Address:</strong> {quotation.customer?.address}</p>
                          </div>
                        </div>

                        {/* Items */}
                        <div>
                          <h5 className="font-medium text-gray-900 mb-2">Items</h5>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brand</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {quotation.items.map((item, index) => (
                                  <tr key={index}>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.product_code}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.product_name}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.brand}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.quantity}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">{item.unit}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">${item.unit_price.toFixed(2)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-900">${item.total_price.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Totals */}
                        <div className="flex justify-end">
                          <div className="w-64 space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Subtotal:</span>
                              <span className="font-medium">${quotation.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Tax ({quotation.tax_rate}%):</span>
                              <span className="font-medium">${quotation.tax_amount.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-lg font-bold border-t pt-2">
                              <span>Total:</span>
                              <span>${quotation.total.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Notes */}
                        {quotation.notes && (
                          <div>
                            <h5 className="font-medium text-gray-900 mb-2">Notes</h5>
                            <p className="text-sm text-gray-600">{quotation.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Paste Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Paste Data</h3>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Data Type</label>
                <select
                  value={pasteType}
                  onChange={(e) => setPasteType(e.target.value as any)}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="inventory">Inventory Items</option>
                  <option value="manual">Manual Format</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {pasteType === 'inventory' ? 'Paste inventory data (tab-separated):' :
                   'Paste data (tab-separated):'}
                </label>
                <textarea
                  ref={pasteTextareaRef}
                  value={pasteData}
                  onChange={(e) => setPasteData(e.target.value)}
                  rows={8}
                  className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  placeholder={
                    pasteType === 'inventory' ? 'Product Code\tProduct Name\tBrand\tQuantity\tUnit\tUnit Price\tNotes' :
                    'Product Code\tProduct Name\tBrand\tQuantity\tUnit\tUnit Price\tNotes'
                  }
                />
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowPasteModal(false);
                    setPasteData('');
                  }}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={processPastedData}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  Process Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Quotation; 